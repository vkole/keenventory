import type Database from 'better-sqlite3';
export function initializeMaterials(db: Database.Database) {
  db.transaction(() => {
    const columns = db.prepare('PRAGMA table_info(materials)').all() as {name:string}[];
    for (const [name,type] of Object.entries({cost_per_unit_micros:'INTEGER', description:"TEXT NOT NULL DEFAULT ''", archived:'INTEGER NOT NULL DEFAULT 0', supplier_id:'INTEGER', supplier_name:"TEXT NOT NULL DEFAULT ''", supplier_website:"TEXT NOT NULL DEFAULT ''", product_url:"TEXT NOT NULL DEFAULT ''", supplier_sku:"TEXT NOT NULL DEFAULT ''", purchase_unit:"TEXT NOT NULL DEFAULT ''", purchase_quantity:'REAL NOT NULL DEFAULT 1', purchase_price:'REAL NOT NULL DEFAULT 0', preferred_reorder_quantity:'REAL NOT NULL DEFAULT 0', lead_time_days:'INTEGER NOT NULL DEFAULT 0', notes:"TEXT NOT NULL DEFAULT ''"})) {
      if (!columns.some(c=>c.name===name)) db.exec(`ALTER TABLE materials ADD COLUMN ${name} ${type}`);
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS material_barcodes(id INTEGER PRIMARY KEY, material_id INTEGER NOT NULL REFERENCES materials(id), value TEXT NOT NULL UNIQUE, type TEXT NOT NULL, package_quantity REAL NOT NULL CHECK(package_quantity>0), package_unit TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS material_images(id INTEGER PRIMARY KEY, material_id INTEGER NOT NULL REFERENCES materials(id), object_key TEXT NOT NULL, is_primary INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE UNIQUE INDEX IF NOT EXISTS material_primary_image ON material_images(material_id) WHERE is_primary=1;
      CREATE TABLE IF NOT EXISTS barcode_scans(id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, material_id INTEGER NOT NULL REFERENCES materials(id), value TEXT NOT NULL, stock_status TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'Lookup', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS material_receipts(id INTEGER PRIMARY KEY, material_id INTEGER NOT NULL REFERENCES materials(id), purchase_id INTEGER NOT NULL REFERENCES purchase_orders(id), quantity REAL NOT NULL, unit_cost REAL NOT NULL, user_id TEXT NOT NULL, request_key TEXT NOT NULL UNIQUE, details TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS material_adjustment_requests(request_key TEXT PRIMARY KEY, material_id INTEGER NOT NULL, user_id TEXT NOT NULL, details TEXT NOT NULL);
    `);

    const barcodeColumns=db.prepare('PRAGMA table_info(material_barcodes)').all() as {name:string}[];
    if(!barcodeColumns.some(c=>c.name==='active'))db.exec('ALTER TABLE material_barcodes ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
    db.exec(`
      CREATE TABLE IF NOT EXISTS generated_inventory_codes(value TEXT PRIMARY KEY,material_id INTEGER NOT NULL REFERENCES materials(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TRIGGER IF NOT EXISTS material_cost_legacy_update AFTER UPDATE OF cost_per_unit ON materials
      WHEN NEW.cost_per_unit <> OLD.cost_per_unit BEGIN
       UPDATE materials SET cost_per_unit_micros=NULL WHERE id=NEW.id;
      END;
    `);
  }).immediate();
}
