import type Database from 'better-sqlite3';
import { activeProduct, moveStock } from './productStore';
import {
  decimal,
  money,
  quantity,
  planProduction,
  type Formula,
  type Stock,
  type Ingredient,
} from './production';

export type Snapshot = Formula & {
  id: number;
  product_id: number;
  version: number;
  name: string;
  plan: ReturnType<typeof planProduction>;
};
export function inventory(
  db: Database.Database,
  excludeBatch?: number,
): Stock[] {
  const stock = db.prepare('SELECT * FROM materials').all() as Stock[];
  const batches = db
    .prepare(
      "SELECT id, recipe_snapshot FROM manufacturing_batches WHERE status IN ('Draft','Scheduled','In Progress') AND recipe_snapshot IS NOT NULL",
    )
    .all() as { id: number; recipe_snapshot: string }[];
  for (const s of stock) s.reserved_quantity = 0;
  for (const b of batches) {
    if (b.id === excludeBatch) continue;
    const snapshot = JSON.parse(b.recipe_snapshot) as Snapshot;
    for (const line of snapshot.plan.availability) {
      const s = stock.find((m) => m.id === line.id);
      if (s)
        s.reserved_quantity = quantity(
          decimal(s.reserved_quantity ?? 0).plus(line.required),
        );
    }
  }
  return stock;
}
export function createBatch(
  db: Database.Database,
  p: {
    request_key: string;
    recipe_id: number;
    product_id: number;
    planned_quantity: number;
  },
) {
  return db
    .transaction(() => {
      const previous = db
        .prepare('SELECT * FROM manufacturing_batches WHERE request_key=?')
        .get(p.request_key) as
        | {
            id: number;
            recipe_id: number;
            product_id: number;
            planned_quantity: number;
          }
        | undefined;
      if (previous) {
        if (
          previous.recipe_id !== p.recipe_id ||
          previous.product_id !== p.product_id ||
          previous.planned_quantity !== p.planned_quantity
        )
          throw new Error('Request key already used for another batch.');
        return previous.id;
      }
      const recipe = db
        .prepare('SELECT * FROM recipes WHERE id=?')
        .get(p.recipe_id) as Snapshot | undefined;
      if (!recipe || recipe.product_id !== p.product_id)
        throw new Error('Select the recipe associated with this product.');
      activeProduct(db, p.product_id);
      const ingredients = db
        .prepare('SELECT * FROM recipe_items WHERE recipe_id=?')
        .all(p.recipe_id) as Ingredient[];
      if (!ingredients.length) throw new Error('Add ingredients before creating a manufacturing batch.');
      const plan = planProduction(
        { ...recipe, ingredients },
        inventory(db),
        p.planned_quantity,
      );
      if (plan.hasShortage)
        throw new Error(
          'Insufficient available inventory or mismatched ingredient units.',
        );
      const snapshot = {
        ...recipe,
        ingredients,
        batch_yield: p.planned_quantity,
        plan,
      };
      return Number(
        db
          .prepare(
            "INSERT INTO manufacturing_batches (product_id,recipe_id,status,planned_quantity,completed_quantity,request_key,recipe_snapshot) VALUES (?,?,'Draft',?,0,?,?)",
          )
          .run(
            p.product_id,
            p.recipe_id,
            p.planned_quantity,
            p.request_key,
            JSON.stringify(snapshot),
          ).lastInsertRowid,
      );
    })
    .immediate();
}
export function completeBatch(
  db: Database.Database,
  p: {
    id: number;
    actual_quantity: number;
    actual_minutes: number;
    hourly_labor_rate: number;
    consumption: { material_id: number; quantity: number }[];
  },
) {
  return db
    .transaction(() => {
      const batch = db
        .prepare('SELECT * FROM manufacturing_batches WHERE id=?')
        .get(p.id) as
        | { status: string; product_id: number; recipe_snapshot: string }
        | undefined;
      if (!batch) throw new Error('Batch not found.');
      if (batch.status === 'Completed') return;
      if (
        !batch.recipe_snapshot ||
        !['Draft', 'Scheduled', 'In Progress'].includes(batch.status)
      )
        throw new Error('This batch cannot be completed.');
      const snapshot = JSON.parse(batch.recipe_snapshot) as Snapshot;
      const expected = snapshot.plan.availability;
      if (
        p.consumption.length !== expected.length ||
        new Set(p.consumption.map((c) => c.material_id)).size !==
          expected.length ||
        expected.some((e) => !p.consumption.some((c) => c.material_id === e.id))
      )
        throw new Error('Record actual consumption for every ingredient.');
      const stock = inventory(db, p.id);
      let materialCost = decimal(0);
      for (const c of p.consumption) {
        const m = stock.find((s) => s.id === c.material_id);
        if (
          !m ||
          decimal(m.stock_quantity)
            .minus(m.reserved_quantity ?? 0)
            .lt(c.quantity)
        )
          throw new Error(
            `Insufficient unreserved inventory for ${m?.name ?? c.material_id}.`,
          );
        const snap = expected.find((e) => e.id === c.material_id)!;
        db.prepare("INSERT INTO inventory_ledger(material_id,location,delta,balance,kind,reason,reference_type,reference_id,unit_cost) VALUES (?,?,?,?,'Manufacturing consumption',?,'manufacturing',?,?)").run(c.material_id,'Inventory',-c.quantity,quantity(decimal(m.stock_quantity).minus(c.quantity)),`Batch #${p.id}`,p.id,m.cost_per_unit);
        materialCost = materialCost.plus(
          decimal(c.quantity).times(snap.cost_per_unit),
        );
        db.prepare(
          'UPDATE materials SET stock_quantity=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        ).run(
          quantity(decimal(m.stock_quantity).minus(c.quantity)),
          c.material_id,
        );
      }
      const product = db
        .prepare('SELECT stock_quantity,cost_per_unit FROM products WHERE id=?')
        .get(batch.product_id) as { stock_quantity: number; cost_per_unit:number } | undefined;
      if (!product) throw new Error('Finished product not found.');
      const actualCost = money(
        materialCost
          .plus(decimal(p.actual_minutes).div(60).times(p.hourly_labor_rate))
          .plus(snapshot.overhead ?? 0),
      );
      const destination = (db.prepare('SELECT location FROM products WHERE id=?').get(batch.product_id) as {location:string}).location;
      moveStock(db,{id:batch.product_id,location:destination,delta:p.actual_quantity,kind:'Manufacturing',reason:`Batch #${p.id}`,reference_type:'manufacturing',reference_id:p.id,request_key:`manufacturing:${p.id}`});
      if(p.actual_quantity>0)db.prepare('UPDATE products SET cost_per_unit=? WHERE id=?').run(quantity(decimal(product.stock_quantity).times(product.cost_per_unit).plus(actualCost).div(decimal(product.stock_quantity).plus(p.actual_quantity))),batch.product_id);
      db.prepare("UPDATE inventory_ledger SET unit_cost=(SELECT cost_per_unit FROM products WHERE id=?) WHERE request_key=?").run(batch.product_id,`manufacturing:${p.id}`);
      db.prepare(
        "UPDATE manufacturing_batches SET status='Completed', completed_quantity=?, actual_minutes=?, hourly_labor_rate=?, actual_cost=?, consumption=?, completed_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(
        p.actual_quantity,
        p.actual_minutes,
        p.hourly_labor_rate,
        actualCost,
        JSON.stringify(p.consumption),
        p.id,
      );
    })
    .immediate();
}
