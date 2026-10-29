import type Database from 'better-sqlite3';
import { decimal, quantity, money } from './production';
import { z } from 'zod';
export type ProductRecord = {
  updated_at: string;
  id: number;
  name: string;
  sku: string;
  category: string;
  description: string;
  measurement_type: string;
  stock_quantity: number;
  cost_per_unit: number;
  retail_price: number;
  wholesale_price: number;
  sale_quantity: number;
  reorder_threshold: number;
  state: 'Active' | 'Draft' | 'Inactive';
  auto_manufacture: number;
  location: string;
  parent_id: number | null;
  attributes: string;
  attribute_definitions: string;
  barcode: string;
  archived_at: string | null;
  merged_into_id: number | null;
  reserved: number;
  available: number;
  consigned: number;
  image_id?: number;
  images?: { id: number; object_key: string; is_primary: number }[];
  locations?: { location:string; quantity:number; consigned:number; reserved:number; available:number }[];
};
export function initializeProducts(db: Database.Database) {
  db.transaction(() => {
    const columns: Record<string, string> = {
      description: "TEXT NOT NULL DEFAULT ''",
      measurement_type: "TEXT NOT NULL DEFAULT 'Units'",
      wholesale_price: 'REAL NOT NULL DEFAULT 0',
      sale_quantity: 'REAL NOT NULL DEFAULT 1',
      reorder_threshold: 'REAL NOT NULL DEFAULT 0',
      state: "TEXT NOT NULL DEFAULT 'Active'",
      auto_manufacture: 'INTEGER NOT NULL DEFAULT 0',
      parent_id: 'INTEGER',
      attributes: "TEXT NOT NULL DEFAULT '{}'",
      attribute_definitions: "TEXT NOT NULL DEFAULT '{}'",
      barcode: "TEXT NOT NULL DEFAULT ''",
      archived_at: 'TEXT',
      merged_into_id: 'INTEGER',
    };
    const existing = db.prepare('PRAGMA table_info(products)').all() as {
      name: string;
    }[];
    for (const [name, definition] of Object.entries(columns))
      if (!existing.some((c) => c.name === name))
        db.exec(`ALTER TABLE products ADD COLUMN ${name} ${definition}`);
    db.exec(`
 CREATE TABLE IF NOT EXISTS product_locations(product_id INTEGER NOT NULL,location TEXT NOT NULL,quantity REAL NOT NULL DEFAULT 0,consigned REAL NOT NULL DEFAULT 0,PRIMARY KEY(product_id,location));
 CREATE TABLE IF NOT EXISTS inventory_ledger(id INTEGER PRIMARY KEY,product_id INTEGER,material_id INTEGER,location TEXT NOT NULL,delta REAL NOT NULL,balance REAL NOT NULL,kind TEXT NOT NULL,reason TEXT NOT NULL,reference_type TEXT,reference_id INTEGER,request_key TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE UNIQUE INDEX IF NOT EXISTS ledger_request_key ON inventory_ledger(request_key) WHERE request_key IS NOT NULL;
 CREATE TABLE IF NOT EXISTS product_events(id INTEGER PRIMARY KEY,product_id INTEGER NOT NULL,kind TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS image_objects(id INTEGER PRIMARY KEY,object_key TEXT NOT NULL UNIQUE,content_type TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS product_images(product_id INTEGER NOT NULL,image_id INTEGER NOT NULL,is_primary INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(product_id,image_id));
 CREATE TABLE IF NOT EXISTS sales_order_lines(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity REAL NOT NULL,unit_price REAL NOT NULL,location TEXT NOT NULL,fulfilled INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS purchase_order_lines(id INTEGER PRIMARY KEY,purchase_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity REAL NOT NULL,unit_cost REAL NOT NULL,location TEXT NOT NULL,received INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS product_stocktakes(id INTEGER PRIMARY KEY,product_id INTEGER NOT NULL,location TEXT NOT NULL,system_quantity REAL NOT NULL,actual_quantity REAL NOT NULL,variance REAL NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS shopify_mappings(product_id INTEGER PRIMARY KEY,shop TEXT NOT NULL,shopify_product_id TEXT NOT NULL,variant_id TEXT NOT NULL UNIQUE,inventory_item_id TEXT NOT NULL UNIQUE,location_id TEXT NOT NULL,remote_sku TEXT NOT NULL,local_location TEXT NOT NULL DEFAULT '',sync_status TEXT NOT NULL DEFAULT 'Mapped',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS push_activity(id INTEGER PRIMARY KEY,product_id INTEGER NOT NULL,request_key TEXT NOT NULL UNIQUE,operation TEXT NOT NULL,status TEXT NOT NULL,local_quantity REAL,remote_quantity REAL,mapping_snapshot TEXT NOT NULL,result TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 `);
    const products = db
      .prepare(
        'SELECT * FROM products WHERE id NOT IN (SELECT product_id FROM product_locations)',
      )
      .all() as ProductRecord[];
    for (const p of products) {
      db.prepare(
        'INSERT INTO product_locations(product_id,location,quantity) VALUES (?,?,?)',
      ).run(p.id, p.location, p.stock_quantity);
      if (p.stock_quantity)
        db.prepare(
          "INSERT INTO inventory_ledger(product_id,location,delta,balance,kind,reason) VALUES (?,?,?,?,'Baseline','Balance carried forward during product management migration')",
        ).run(p.id, p.location, p.stock_quantity, p.stock_quantity);
    }
  }).immediate();
}
export function product(db: Database.Database, id: number): ProductRecord {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(id) as
    ProductRecord | undefined;
  if (!p) throw Error('Product not found.');
  const reserved = (
    db
      .prepare(
        "SELECT COALESCE(SUM(l.quantity),0) AS n FROM sales_order_lines l JOIN sales_orders o ON o.id=l.order_id WHERE l.product_id=? AND l.fulfilled=0 AND o.status NOT IN ('Cancelled','Fulfilled')",
      )
      .get(id) as { n: number }
  ).n;
  const consigned = (
    db
      .prepare(
        'SELECT COALESCE(SUM(consigned),0) AS n FROM product_locations WHERE product_id=?',
      )
      .get(id) as { n: number }
  ).n;
  const images = db
    .prepare(
      'SELECT o.id,o.object_key,i.is_primary FROM product_images i JOIN image_objects o ON o.id=i.image_id WHERE i.product_id=? ORDER BY i.is_primary DESC,o.id',
    )
    .all(id) as NonNullable<ProductRecord['images']>;
  const locations=(db.prepare('SELECT * FROM product_locations WHERE product_id=?').all(id) as NonNullable<ProductRecord['locations']>).map(l=>{
    const r=(db.prepare("SELECT COALESCE(SUM(l.quantity),0) n FROM sales_order_lines l JOIN sales_orders o ON o.id=l.order_id WHERE l.product_id=? AND l.location=? AND l.fulfilled=0 AND o.status NOT IN ('Cancelled','Fulfilled')").get(id,l.location) as {n:number}).n;
    return {...l,reserved:r,available:quantity(decimal(l.quantity).minus(l.consigned).minus(r))};
  });
  return {
    ...p,
    reserved,
    consigned,
    available: quantity(
      decimal(p.stock_quantity).minus(reserved).minus(consigned),
    ),
    images,
    locations,
    image_id: images[0]?.id,
  };
}
export function products(db: Database.Database) {
  return (
    db.prepare('SELECT id FROM products ORDER BY name').all() as {
      id: number;
    }[]
  ).map((p) => product(db, p.id));
}
export function activeProduct(db: Database.Database, id: number) {
  const p = product(db, id);
  if (p.archived_at || p.merged_into_id || p.state !== 'Active')
    throw Error('Choose an active product.');
  return p;
}
export function event(
  db: Database.Database,
  id: number,
  kind: string,
  details: unknown,
) {
  db.prepare(
    'INSERT INTO product_events(product_id,kind,details) VALUES (?,?,?)',
  ).run(id, kind, JSON.stringify(details));
}
export function moveStock(
  db: Database.Database,
  p: {
    id: number;
    location: string;
    delta: number;
    kind: string;
    reason: string;
    reference_type?: string;
    reference_id?: number;
    request_key?: string;
    allowReserved?: boolean;
  },
) {
  if (
    p.request_key &&
    db
      .prepare('SELECT id FROM inventory_ledger WHERE request_key=?')
      .get(p.request_key)
  )
    return;
  const item = product(db, p.id);
  const current = db
    .prepare(
      'SELECT quantity,consigned FROM product_locations WHERE product_id=? AND location=?',
    )
    .get(p.id, p.location) as
    { quantity: number; consigned: number } | undefined;
  const balance = quantity(decimal(current?.quantity ?? 0).plus(p.delta));
  const reserved = (
    db
      .prepare(
        "SELECT COALESCE(SUM(l.quantity),0) AS n FROM sales_order_lines l JOIN sales_orders o ON o.id=l.order_id WHERE l.product_id=? AND l.location=? AND l.fulfilled=0 AND o.status NOT IN ('Cancelled','Fulfilled')",
      )
      .get(p.id, p.location) as { n: number }
  ).n;
  if (
    balance < 0 ||
    (!p.allowReserved && balance < reserved + (current?.consigned ?? 0))
  )
    throw Error('Insufficient unreserved stock at this location.');
  db.prepare(
    'INSERT INTO product_locations(product_id,location,quantity) VALUES (?,?,?) ON CONFLICT(product_id,location) DO UPDATE SET quantity=excluded.quantity',
  ).run(p.id, p.location, balance);
  db.prepare(
    'UPDATE products SET stock_quantity=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
  ).run(quantity(decimal(item.stock_quantity).plus(p.delta)), p.id);
  db.prepare(
    'INSERT INTO inventory_ledger(product_id,location,delta,balance,kind,reason,reference_type,reference_id,request_key) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(
    p.id,
    p.location,
    p.delta,
    balance,
    p.kind,
    p.reason,
    p.reference_type ?? null,
    p.reference_id ?? null,
    p.request_key ?? null,
  );
}
const amount = z.coerce.number().finite().nonnegative().max(1e9);
export const productSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(250),
  sku: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(
      /^[A-Za-z0-9._+&-]+$/,
      'SKU supports letters, numbers, -, _, ., + and &.',
    ),
  category: z.string().default('Candle'),
  description: z.string().default(''),
  measurement_type: z.string().min(1).default('Units'),
  stock_quantity: amount.default(0),
  cost_per_unit: amount.default(0),
  retail_price: amount.default(0),
  wholesale_price: amount.default(0),
  sale_quantity: amount.positive().default(1),
  reorder_threshold: amount.default(0),
  state: z.enum(['Active', 'Draft', 'Inactive']).default('Active'),
  auto_manufacture: z.coerce.boolean().default(false),
  location: z.string().trim().min(1).default('Finished Goods Storage'),
  parent_id: z.number().int().positive().nullable().optional(),
  attributes: z.record(z.string(), z.string()).default({}),
  barcode: z.string().default(''),
  confirm_sku_change: z.boolean().default(false),
});
export type ProductInput = z.infer<typeof productSchema>;
export function saveProduct(db: Database.Database, input: unknown) {
  const p = productSchema.parse(input);
  return db
    .transaction(() => {
      const previous = p.id ? product(db, p.id) : null;
      if (
        db
          .prepare(
            'SELECT id FROM products WHERE sku=? COLLATE NOCASE AND id<>?',
          )
          .get(p.sku, p.id ?? 0)
      )
        throw Error('This SKU already exists, including archived products.');
      if (previous && previous.sku !== p.sku && !p.confirm_sku_change)
        throw Error(
          'Confirm the SKU change. Shopify ID mappings will be preserved; SKU reconciliation is separate.',
        );
      if (
        previous &&
        previous.measurement_type !== p.measurement_type &&
        (previous.stock_quantity ||
          db
            .prepare('SELECT id FROM inventory_ledger WHERE product_id=?')
            .get(previous.id))
      )
        throw Error(
          'Measurement type cannot change after inventory has been recorded.',
        );
      if (p.parent_id) {
        const parent = activeProduct(db, p.parent_id);
        if (parent.id === p.id || parent.parent_id)
          throw Error('Choose a parent product, not another variation.');
        if (p.id && db.prepare('SELECT id FROM products WHERE parent_id=?').get(p.id))
          throw Error('A product with variations cannot become a variation.');
        const defs = JSON.parse(parent.attribute_definitions) as Record<
          string,
          string[]
        >;
        for (const [key, value] of Object.entries(p.attributes))
          if (!defs[key]?.includes(value))
            throw Error(`Choose a configured value for ${key}.`);
        for (const key of Object.keys(defs))
          if (!p.attributes[key])
            throw Error(`Choose a configured value for ${key}.`);
      }
      const values = [
        p.name,
        p.sku,
        p.category,
        p.description,
        p.measurement_type,
        p.retail_price,
        p.wholesale_price,
        p.sale_quantity,
        p.reorder_threshold,
        p.state,
        p.auto_manufacture ? 1 : 0,
        p.parent_id ?? null,
        JSON.stringify(p.attributes),
        p.barcode,
      ];
      let id = p.id;
      if (id) {
        if (previous!.parent_id !== (p.parent_id ?? null))
          throw Error(
            'A saved product cannot be moved to a different variation parent.',
          );
        db.prepare(
          'UPDATE products SET name=?,sku=?,category=?,description=?,measurement_type=?,retail_price=?,wholesale_price=?,sale_quantity=?,reorder_threshold=?,state=?,auto_manufacture=?,parent_id=?,attributes=?,barcode=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
        ).run(...values, id);
      } else {
        id = Number(
          db
            .prepare(
              'INSERT INTO products(name,sku,category,description,measurement_type,retail_price,wholesale_price,sale_quantity,reorder_threshold,state,auto_manufacture,parent_id,attributes,barcode,location,cost_per_unit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            )
            .run(...values, p.location, p.cost_per_unit).lastInsertRowid,
        );
        db.prepare(
          'INSERT INTO product_locations(product_id,location,quantity) VALUES (?,?,0)',
        ).run(id, p.location);
        if (p.stock_quantity)
          moveStock(db, {
            id,
            location: p.location,
            delta: p.stock_quantity,
            kind: 'Opening',
            reason: 'Initial product setup',
          });
      }
      if (previous) {
        db.prepare(
          'INSERT OR IGNORE INTO product_locations(product_id,location,quantity) VALUES (?,?,0)',
        ).run(id, p.location);
        db.prepare('UPDATE products SET location=? WHERE id=?').run(
          p.location,
          id,
        );
      }
      event(db, id, previous ? 'Updated' : 'Created', {
        sku: p.sku,
        previous_sku: previous?.sku,
      });
      return id;
    })
    .immediate();
}
export function references(db: Database.Database, id: number) {
  return Object.fromEntries(
    Object.entries({
      recipes: 'SELECT COUNT(*) n FROM recipes WHERE product_id=?',
      manufactures:
        'SELECT COUNT(*) n FROM manufacturing_batches WHERE product_id=?',
      orders: 'SELECT COUNT(*) n FROM sales_order_lines WHERE product_id=?',
      purchases:
        'SELECT COUNT(*) n FROM purchase_order_lines WHERE product_id=?',
      ledger: 'SELECT COUNT(*) n FROM inventory_ledger WHERE product_id=?',
      stocktakes:
        'SELECT COUNT(*) n FROM product_stocktakes WHERE product_id=?',
      shopify: 'SELECT COUNT(*) n FROM shopify_mappings WHERE product_id=?',
      variations: 'SELECT COUNT(*) n FROM products WHERE parent_id=?',
      pushes: 'SELECT COUNT(*) n FROM push_activity WHERE product_id=?',
    }).map(([key, sql]) => [key, (db.prepare(sql).get(id) as { n: number }).n]),
  );
}
export function relatedIds(db: Database.Database, id: number): number[] {
  const seen = new Set<number>([id]);
  const visit = (current: number) => {
    for (const p of db
      .prepare('SELECT id FROM products WHERE merged_into_id=?')
      .all(current) as { id: number }[])
      if (!seen.has(p.id)) {
        seen.add(p.id);
        visit(p.id);
      }
  };
  visit(id);
  return [...seen];
}
export function productDetail(db: Database.Database, id: number) {
  const p = product(db, id);
  const ids = relatedIds(db, id);
  const marks = ids.map(() => '?').join(',');
  const query = (sql: string) => db.prepare(sql).all(...ids);
  return {
    product: p,
    references: references(db, id),
    variations: db
      .prepare('SELECT id FROM products WHERE parent_id=?')
      .all(id)
      .map((v) => product(db, (v as { id: number }).id)),
    locations: db
      .prepare('SELECT * FROM product_locations WHERE product_id=?')
      .all(id),
    ledger: query(
      `SELECT * FROM inventory_ledger WHERE product_id IN (${marks}) ORDER BY id DESC`,
    ),
    events: query(
      `SELECT * FROM product_events WHERE product_id IN (${marks}) ORDER BY id DESC`,
    ),
    manufactures: query(
      `SELECT * FROM manufacturing_batches WHERE product_id IN (${marks}) ORDER BY id DESC`,
    ),
    recipes: query(
      `SELECT * FROM recipes WHERE product_id IN (${marks}) ORDER BY version DESC`,
    ),
    orders: query(
      `SELECT l.*,o.customer,o.status,o.order_date FROM sales_order_lines l JOIN sales_orders o ON o.id=l.order_id WHERE l.product_id IN (${marks}) ORDER BY l.id DESC`,
    ),
    purchases: query(
      `SELECT l.*,o.supplier,o.status,o.order_date FROM purchase_order_lines l JOIN purchase_orders o ON o.id=l.purchase_id WHERE l.product_id IN (${marks}) ORDER BY l.id DESC`,
    ),
    stocktakes: query(
      `SELECT * FROM product_stocktakes WHERE product_id IN (${marks}) ORDER BY id DESC`,
    ),
    listings: query(
      `SELECT * FROM shopify_mappings WHERE product_id IN (${marks})`,
    ),
    pushes: query(
      `SELECT * FROM push_activity WHERE product_id IN (${marks}) ORDER BY id DESC`,
    ),
  };
}
