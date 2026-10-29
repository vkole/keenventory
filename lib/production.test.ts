import { TestRequest as Request, setupTestOwner } from './authTestSupport';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  planProduction,
  pricing,
  type Stock,
  type Formula,
} from './production';
import { createBatch, completeBatch, inventory } from './manufacturing';

const stock: Stock[] = [
  {
    id: 1,
    name: 'Wax',
    unit: 'oz',
    stock_quantity: 400,
    cost_per_unit: 0.18,
    reorder_threshold: 10,
  },
  {
    id: 2,
    name: 'Fragrance',
    unit: 'oz',
    stock_quantity: 30,
    cost_per_unit: 1.25,
    reorder_threshold: 5,
  },
  {
    id: 3,
    name: 'Jar',
    unit: 'unit',
    stock_quantity: 25,
    cost_per_unit: 3.25,
    reorder_threshold: 2,
  },
];
const formula: Formula = {
  batch_yield: 12,
  batch_minutes: 45,
  hourly_labor_rate: 12,
  labor_mode: 'fixed',
  overhead: 0,
  ingredients: stock.map((s, i) => ({
    material_id: s.id,
    item_name: s.name,
    quantity: i === 0 ? 9 : 1,
    unit: s.unit,
    item_type: i === 2 ? 'component' : 'material',
  })),
};
test('example costs, yield scaling, labor models, profitability and inventory capacity', () => {
  const p = planProduction(formula, stock);
  assert.equal(p.materialCost, 34.44);
  assert.equal(p.componentCost, 39);
  assert.equal(p.laborCost, 9);
  assert.equal(p.totalBatchCost, 82.44);
  assert.equal(p.costPerUnit, 6.87);
  assert.equal(p.capacity, 25);
  assert.deepEqual(p.limiting, ['Jar']);
  assert.equal(p.lines[0].required, 108);
  const doubled = planProduction(formula, stock, 24);
  assert.equal(doubled.lines[0].required, 216);
  assert.equal(doubled.lines[1].required, 24);
  assert.equal(doubled.laborCost, 9);
  assert.equal(
    planProduction({ ...formula, batch_minutes: 90 }, stock).laborCost,
    18,
  );
  assert.equal(
    planProduction(
      { ...formula, labor_mode: 'per_unit', batch_minutes: 2 },
      stock,
    ).laborCost,
    4.8,
  );
  assert.equal(
    planProduction(
      { ...formula, labor_mode: 'scaled', labor_reference_yield: 12 },
      stock,
      24,
    ).laborCost,
    18,
  );
  assert.equal(planProduction(formula, stock, 26).hasShortage, true);
  assert.equal(
    planProduction(
      formula,
      stock.map((s) => ({ ...s, cost_per_unit: s.cost_per_unit * 2 })),
    ).materialCost,
    68.88,
  );
  assert.equal(
    planProduction(
      {
        ...formula,
        ingredients: formula.ingredients.map((i) => ({
          ...i,
          quantity: i.quantity * 2,
        })),
      },
      stock,
    ).materialCost,
    68.88,
  );
  const prices = pricing(6.87, 28, 100, 50, 'margin');
  assert.equal(prices.profit, 21.13);
  assert.equal(prices.margin.toFixed(1), '75.5');
  assert.equal(prices.suggested, 13.74);
  assert.equal(pricing(6.87, 30, 100, 50, 'margin').profit, 23.13);
  assert.equal(pricing(6.87, 28, 100, 100, 'margin').suggested, null);
});
test('duplicate rows aggregate capacity; reserved stock and unit mismatch prevent overproduction', () => {
  const f = {
    ...formula,
    ingredients: [formula.ingredients[0], formula.ingredients[0]],
  };
  assert.equal(planProduction(f, stock).capacity, 22);
  assert.equal(
    planProduction(
      formula,
      stock.map((s) => ({ ...s, reserved_quantity: s.id === 3 ? 20 : 0 })),
    ).capacity,
    5,
  );
  assert.equal(
    planProduction(
      { ...formula, ingredients: [{ ...formula.ingredients[0], unit: 'kg' }] },
      stock,
    ).hasShortage,
    true,
  );
  const fractional = planProduction(
    {
      ...formula,
      ingredients: [{ ...formula.ingredients[0], quantity: 0.1 }],
      batch_yield: 3,
    },
    [{ ...stock[0], cost_per_unit: 0.2 }],
  );
  assert.equal(fractional.lines[0].required, 0.3);
  assert.equal(fractional.totalBatchCost, 9.06);
});
test('saved recipes reopen; batch reservations, snapshots, atomic rollback and idempotent completion', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'keenventory-test-'));
  process.env.KEENVENTORY_DATA_DIR = folder;
  const { db } = await import('./db');
  await setupTestOwner();
  try {
    const { POST, GET } = await import('../app/api/recipes/route');
    const materials = db.prepare('SELECT * FROM materials').all() as Stock[];
    const product = db.prepare('SELECT * FROM products LIMIT 1').get() as {
      id: number;
      stock_quantity: number;
    };
    const ingredient = materials.find((m) => m.name === 'Candle Wax')!;
    const component = materials.find((m) => m.name === 'Glass Jar')!;
    const payload = {
      name: 'Persistence check',
      product_id: product.id,
      version: 7,
      product_variant: '12 oz',
      batch_yield: 2,
      batch_minutes: 45,
      hourly_labor_rate: 12,
      labor_mode: 'scaled',
      labor_reference_yield: 12,
      overhead: 2.5,
      ingredients: [ingredient, component].map((m, i) => ({
        material_id: m.id,
        item_name: m.name,
        quantity: i ? 1 : 0.1,
        unit: m.unit,
        item_type: i ? 'component' : 'material',
      })),
    };
    const req = (body: unknown) =>
      new Request('http://localhost/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const response = await POST(req(payload));
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(
      (
        db
          .prepare('SELECT stock_quantity FROM materials WHERE id=?')
          .get(ingredient.id) as Stock
      ).stock_quantity,
      ingredient.stock_quantity,
    );
    const reopened = (await (await GET(new Request('http://localhost/api/recipes'))).json()).recipes.find(
      (r: { id: number }) => r.id === saved.id,
    );
    assert.equal(reopened.version, 7);
    assert.equal(reopened.product_variant, '12 oz');
    assert.equal(reopened.labor_mode, 'scaled');
    assert.equal(reopened.ingredients[0].quantity, 0.1);
    assert.equal(
      planProduction(reopened, materials).totalBatchCost,
      planProduction(payload as Formula, materials).totalBatchCost,
    );
    const id = createBatch(db, {
      request_key: 'test-key',
      recipe_id: saved.id,
      product_id: product.id,
      planned_quantity: 2,
    });
    assert.equal(
      createBatch(db, {
        request_key: 'test-key',
        recipe_id: saved.id,
        product_id: product.id,
        planned_quantity: 2,
      }),
      id,
    );
    assert.equal(
      inventory(db).find((m) => m.id === ingredient.id)?.reserved_quantity,
      0.2,
    );
    assert.equal(
      (
        db
          .prepare('SELECT stock_quantity FROM products WHERE id=?')
          .get(product.id) as Stock
      ).stock_quantity,
      product.stock_quantity,
    );
    assert.throws(() =>
      createBatch(db, {
        request_key: 'too-large',
        recipe_id: saved.id,
        product_id: product.id,
        planned_quantity: 100000,
      }),
    );
    const batch = db
      .prepare('SELECT * FROM manufacturing_batches WHERE id=?')
      .get(id) as { recipe_snapshot: string };
    const snapshot = JSON.parse(batch.recipe_snapshot);
    await POST(
      req({
        ...payload,
        id: saved.id,
        version: 8,
        ingredients: [{ ...payload.ingredients[0], quantity: 99 }],
      }),
    );
    db.prepare('UPDATE materials SET cost_per_unit=999 WHERE id=?').run(
      ingredient.id,
    );
    assert.equal(
      JSON.parse(
        (
          db
            .prepare(
              'SELECT recipe_snapshot FROM manufacturing_batches WHERE id=?',
            )
            .get(id) as { recipe_snapshot: string }
        ).recipe_snapshot,
      ).version,
      7,
    );
    const completion = {
      id,
      actual_quantity: 1,
      actual_minutes: 30,
      hourly_labor_rate: 12,
      consumption: snapshot.plan.availability.map(
        (a: { id: number; required: number }) => ({
          material_id: a.id,
          quantity: a.required,
        }),
      ),
    };
    assert.throws(() =>
      completeBatch(db, {
        ...completion,
        consumption: [
          completion.consumption[0],
          { material_id: component.id, quantity: 999999 },
        ],
      }),
    );
    assert.equal(
      (
        db
          .prepare('SELECT stock_quantity FROM materials WHERE id=?')
          .get(ingredient.id) as Stock
      ).stock_quantity,
      ingredient.stock_quantity,
    );
    completeBatch(db, completion);
    completeBatch(db, completion);
    assert.equal(
      (
        db
          .prepare('SELECT stock_quantity FROM materials WHERE id=?')
          .get(ingredient.id) as Stock
      ).stock_quantity,
      ingredient.stock_quantity - 0.2,
    );
    assert.equal(
      (
        db
          .prepare('SELECT stock_quantity FROM materials WHERE id=?')
          .get(component.id) as Stock
      ).stock_quantity,
      component.stock_quantity - 2,
    );
    assert.equal(
      (
        db
          .prepare('SELECT stock_quantity FROM products WHERE id=?')
          .get(product.id) as Stock
      ).stock_quantity,
      product.stock_quantity + 1,
    );
    const completed = db
      .prepare('SELECT * FROM manufacturing_batches WHERE id=?')
      .get(id) as { actual_cost: number; status: string };
    assert.equal(completed.actual_cost, 13.51);
    assert.equal(completed.status, 'Completed');
    assert.equal(
      inventory(db).find((m) => m.id === ingredient.id)?.reserved_quantity,
      0,
    );
    const count = (
      db.prepare('SELECT COUNT(*) AS count FROM recipes').get() as {
        count: number;
      }
    ).count;
    const bad = await POST(
      req({
        ...payload,
        name: 'invalid',
        ingredients: [{ ...payload.ingredients[0], unit: 'kg' }],
      }),
    );
    assert.equal(bad.status, 400);
    assert.equal(
      (
        db.prepare('SELECT COUNT(*) AS count FROM recipes').get() as {
          count: number;
        }
      ).count,
      count,
    );
  } finally {
    db.close();
    delete process.env.KEENVENTORY_DATA_DIR;
    rmSync(folder, { recursive: true, force: true });
  }
});
