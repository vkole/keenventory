import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { initializeProducts } from './productStore';
import { initializeAccess } from './accessSchema';

const dataDirectory =
  // Render disks are unavailable during builds. Keep build-time initialization
  // separate from the persistent workspace and never seed/migrate live data then.
  process.env.NEXT_PHASE === 'phase-production-build'
    ? path.join(process.cwd(), '.next', 'build-data')
    : process.env.KEENVENTORY_DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dataDirectory, { recursive: true });

const dbPath = path.join(dataDirectory, 'keenventory.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    category TEXT,
    unit TEXT,
    stock_quantity REAL NOT NULL DEFAULT 0,
    cost_per_unit REAL NOT NULL DEFAULT 0,
    reorder_threshold REAL NOT NULL DEFAULT 0,
    location TEXT NOT NULL DEFAULT 'Main Storage',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    category TEXT,
    stock_quantity REAL NOT NULL DEFAULT 0,
    cost_per_unit REAL NOT NULL DEFAULT 0,
    retail_price REAL NOT NULL DEFAULT 0,
    location TEXT NOT NULL DEFAULT 'Finished Goods Storage',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    product_id INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    batch_yield REAL NOT NULL DEFAULT 1,
    batch_minutes REAL NOT NULL DEFAULT 0,
    hourly_labor_rate REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Draft',
    instructions TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS recipe_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL,
    item_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT 'material',
    FOREIGN KEY(recipe_id) REFERENCES recipes(id)
  );

  CREATE TABLE IF NOT EXISTS manufacturing_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    recipe_id INTEGER,
    status TEXT NOT NULL DEFAULT 'Draft',
    planned_quantity REAL NOT NULL DEFAULT 0,
    completed_quantity REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Ordered',
    order_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_cost REAL NOT NULL DEFAULT 0,
    expected_delivery TEXT
  );

  CREATE TABLE IF NOT EXISTS sales_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer TEXT NOT NULL,
    order_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'Pending',
    total REAL NOT NULL DEFAULT 0,
    channel TEXT NOT NULL DEFAULT 'Direct'
  );

  CREATE TABLE IF NOT EXISTS adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    website TEXT,
    lead_time TEXT,
    payment_terms TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stocktakes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location TEXT NOT NULL,
    inventory_name TEXT NOT NULL,
    system_quantity REAL NOT NULL DEFAULT 0,
    actual_quantity REAL NOT NULL DEFAULT 0,
    variance REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Additive migrations preserve existing inventory and historical batches.
db.transaction(() => {
  for (const [table, columns] of Object.entries({
    recipes: {
      product_variant: "TEXT NOT NULL DEFAULT ''",
      measurement_unit: "TEXT NOT NULL DEFAULT 'candles'",
      labor_mode: "TEXT NOT NULL DEFAULT 'fixed'",
      labor_reference_yield: 'REAL NOT NULL DEFAULT 1',
      overhead: 'REAL NOT NULL DEFAULT 0',
    },
    recipe_items: { material_id: 'INTEGER' },
    manufacturing_batches: {
      request_key: 'TEXT',
      recipe_snapshot: 'TEXT',
      consumption: 'TEXT',
      actual_minutes: 'REAL NOT NULL DEFAULT 0',
      hourly_labor_rate: 'REAL NOT NULL DEFAULT 0',
      actual_cost: 'REAL NOT NULL DEFAULT 0',
    },
  })) {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
    }[];
    for (const [column, definition] of Object.entries(columns)) {
      if (!existing.some((c) => c.name === column))
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS manufacturing_request_key ON manufacturing_batches(request_key)',
  );
  db.exec(
    `UPDATE recipe_items SET material_id = (SELECT id FROM materials WHERE materials.name = recipe_items.item_name) WHERE material_id IS NULL`,
  );
}).immediate();

export function ensureDatabase() {
  const seedTx = db.transaction(() => {
    const count = db
      .prepare('SELECT COUNT(*) as count FROM materials')
      .get() as { count: number };
    if (count.count > 0) return;
    db.prepare(
      `INSERT INTO materials (name, sku, category, unit, stock_quantity, cost_per_unit, reorder_threshold, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'Candle Wax',
      'MAT-WAX-001',
      'Candle Wax',
      'oz',
      412,
      1.05,
      120,
      'Main Storage',
    );

    db.prepare(
      `INSERT INTO materials (name, sku, category, unit, stock_quantity, cost_per_unit, reorder_threshold, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'Fragrance Oil',
      'MAT-FRAG-001',
      'Fragrance Oils',
      'oz',
      146,
      2.8,
      80,
      'Main Storage',
    );

    db.prepare(
      `INSERT INTO materials (name, sku, category, unit, stock_quantity, cost_per_unit, reorder_threshold, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'Glass Jar',
      'MAT-JAR-001',
      'Candle Jars',
      'unit',
      84,
      2.4,
      30,
      'Main Storage',
    );

    db.prepare(
      `INSERT INTO materials (name, sku, category, unit, stock_quantity, cost_per_unit, reorder_threshold, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'Cotton Wick',
      'MAT-WICK-001',
      'Wicks',
      'unit',
      180,
      0.55,
      50,
      'Production Area',
    );

    db.prepare(
      `INSERT INTO materials (name, sku, category, unit, stock_quantity, cost_per_unit, reorder_threshold, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'Candle Lid',
      'MAT-LID-001',
      'Candle Lids',
      'unit',
      92,
      0.75,
      35,
      'Production Area',
    );

    db.prepare(
      `INSERT INTO products (name, sku, category, stock_quantity, cost_per_unit, retail_price, location)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'Blaque Candle',
      'PRD-BLAQUE-01',
      'Candle',
      28,
      8.14,
      28,
      'Finished Goods Storage',
    );

    db.prepare(
      `INSERT INTO products (name, sku, category, stock_quantity, cost_per_unit, retail_price, location)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'Sakura Candle',
      'PRD-SAKURA-01',
      'Candle',
      18,
      7.96,
      26,
      'Finished Goods Storage',
    );

    db.prepare(
      `INSERT INTO recipes (name, product_id, version, batch_yield, batch_minutes, hourly_labor_rate, status, instructions, notes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'Blaque Candle Formula',
      1,
      1,
      12,
      45,
      8,
      'Active',
      'Melt wax, add fragrance, pour into jar and apply wick.',
      'Use 10% fragrance load and cure 24 hours.',
      1,
    );

    db.prepare(
      `INSERT INTO recipe_items (recipe_id, item_name, quantity, unit, item_type)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(1, 'Candle Wax', 9, 'oz', 'material');

    db.prepare(
      `INSERT INTO recipe_items (recipe_id, item_name, quantity, unit, item_type)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(1, 'Fragrance Oil', 1, 'oz', 'material');

    db.prepare(
      `INSERT INTO recipe_items (recipe_id, item_name, quantity, unit, item_type)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(1, 'Glass Jar', 1, 'unit', 'component');

    db.prepare(
      `INSERT INTO recipe_items (recipe_id, item_name, quantity, unit, item_type)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(1, 'Cotton Wick', 1, 'unit', 'component');

    db.prepare(
      `INSERT INTO recipe_items (recipe_id, item_name, quantity, unit, item_type)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(1, 'Candle Lid', 1, 'unit', 'component');

    db.prepare(
      `INSERT INTO manufacturing_batches (product_id, recipe_id, status, planned_quantity, completed_quantity, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      1,
      1,
      'Completed',
      12,
      12,
      new Date(Date.now() - 2 * 86400000).toISOString(),
    );

    db.prepare(
      `INSERT INTO purchase_orders (supplier, status, order_date, total_cost, expected_delivery)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'North Peak Supplies',
      'Received',
      new Date(Date.now() - 4 * 86400000).toISOString(),
      420,
      new Date(Date.now() - 1 * 86400000).toISOString(),
    );

    db.prepare(
      `INSERT INTO sales_orders (customer, order_date, status, total, channel)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'Luna & Co.',
      new Date(Date.now() - 2 * 86400000).toISOString(),
      'Fulfilled',
      164,
      'Shopify',
    );

    db.prepare(
      `INSERT INTO sales_orders (customer, order_date, status, total, channel)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'Moss Atelier',
      new Date(Date.now() - 5 * 86400000).toISOString(),
      'Pending',
      102,
      'Wholesale',
    );

    db.prepare(
      `INSERT INTO adjustments (item_name, quantity, reason)
       VALUES (?, ?, ?)`,
    ).run('Fragrance Oil', -3, 'Production waste');

    db.prepare(
      `INSERT INTO suppliers (company_name, contact_name, email, phone, website, lead_time, payment_terms, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'North Peak Supplies',
      'Alyssa Chen',
      'alyssa@northpeak.com',
      '(555) 214-6611',
      'northpeak.com',
      '5 days',
      'Net 30',
      'Primary wax and fragrance supplier',
    );

    db.prepare(
      `INSERT INTO suppliers (company_name, contact_name, email, phone, website, lead_time, payment_terms, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'Hearth & Glass Co.',
      'Nathan Bell',
      'nathan@hearthglass.co',
      '(555) 780-2016',
      'hearthglass.co',
      '7 days',
      'Net 14',
      'Jar and lid sourcing partner',
    );

    db.prepare(
      `INSERT INTO stocktakes (location, inventory_name, system_quantity, actual_quantity, variance, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('Main Storage', 'Glass Jar', 90, 86, -4, 'Approved');
  });

  seedTx.immediate();
}

ensureDatabase();
initializeProducts(db);
initializeAccess(db);
