import { defaults, type Role } from "./permissions";
import type Database from "better-sqlite3";
export function initializeEnhancements(db: Database.Database) {
  db.transaction(() => {
    db.exec(`
    CREATE TABLE IF NOT EXISTS calendar_events(id INTEGER PRIMARY KEY,organization_id INTEGER NOT NULL DEFAULT 1 CHECK(organization_id=1),title TEXT NOT NULL,event_type TEXT NOT NULL DEFAULT 'Task',starts_at TEXT NOT NULL,timezone TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Scheduled',description TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',record_type TEXT,record_id INTEGER,hidden INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE UNIQUE INDEX IF NOT EXISTS calendar_original_record ON calendar_events(record_type,record_id) WHERE record_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS content_entries(id INTEGER PRIMARY KEY,organization_id INTEGER NOT NULL DEFAULT 1 CHECK(organization_id=1),title TEXT NOT NULL,platform TEXT NOT NULL,content_type TEXT NOT NULL,scheduled_at TEXT NOT NULL,timezone TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Idea',description TEXT NOT NULL DEFAULT '',hashtags TEXT NOT NULL DEFAULT '',campaign TEXT NOT NULL DEFAULT '',assigned_user TEXT,notes TEXT NOT NULL DEFAULT '',external_link TEXT NOT NULL DEFAULT '',created_by TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS content_products(content_id INTEGER NOT NULL,product_id INTEGER NOT NULL,PRIMARY KEY(content_id,product_id));
    CREATE TABLE IF NOT EXISTS attachments(id INTEGER PRIMARY KEY,organization_id INTEGER NOT NULL DEFAULT 1 CHECK(organization_id=1),owner_type TEXT NOT NULL,owner_id INTEGER NOT NULL,object_key TEXT NOT NULL,filename TEXT NOT NULL,content_type TEXT NOT NULL,size INTEGER NOT NULL,is_primary INTEGER NOT NULL DEFAULT 0,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS import_jobs(id TEXT PRIMARY KEY,organization_id INTEGER NOT NULL DEFAULT 1 CHECK(organization_id=1),kind TEXT NOT NULL,filename TEXT NOT NULL,content_type TEXT NOT NULL,document BLOB NOT NULL,source_rows TEXT NOT NULL,extracted_text TEXT NOT NULL DEFAULT '',preview TEXT,preview_hash TEXT,status TEXT NOT NULL DEFAULT 'Uploaded',result TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS import_job_errors(id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,row_number INTEGER,message TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS imported_documents(job_id TEXT NOT NULL,record_type TEXT NOT NULL,record_id INTEGER NOT NULL,PRIMARY KEY(job_id,record_type,record_id));
    CREATE TABLE IF NOT EXISTS inventory_snapshots(id INTEGER PRIMARY KEY,organization_id INTEGER NOT NULL DEFAULT 1 CHECK(organization_id=1),item_type TEXT NOT NULL,item_id INTEGER NOT NULL,location TEXT NOT NULL,quantity REAL NOT NULL,unit_cost REAL,recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS enhancement_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  `);
    const additions: Record<string, Record<string, string>> = {
      recipes: {
        description: "TEXT NOT NULL DEFAULT ''",
        preparation_notes: "TEXT NOT NULL DEFAULT ''",
        safety_notes: "TEXT NOT NULL DEFAULT ''",
      },
      products: {
        product_type: "TEXT NOT NULL DEFAULT ''",
        variant: "TEXT NOT NULL DEFAULT ''",
        size: "TEXT NOT NULL DEFAULT ''",
        scent: "TEXT NOT NULL DEFAULT ''",
        supplier: "TEXT NOT NULL DEFAULT ''",
        image_url: "TEXT NOT NULL DEFAULT ''",
      },
      sales_orders: {
        scheduled_at: "TEXT",
        order_number: "TEXT",
        customer_email: "TEXT NOT NULL DEFAULT ''",
        payment_status: "TEXT NOT NULL DEFAULT 'Unpaid'",
        shipping: "REAL NOT NULL DEFAULT 0",
        tax: "REAL NOT NULL DEFAULT 0",
        notes: "TEXT NOT NULL DEFAULT ''",
      },
      sales_order_lines: {
        discount: "REAL NOT NULL DEFAULT 0",
        cost_at_sale: "REAL",
      },
      manufacturing_batches: { scheduled_at: "TEXT" },
      purchase_orders: { scheduled_at: "TEXT" },
      stocktakes: { scheduled_at: "TEXT" },
      inventory_ledger: { unit_cost: "REAL" },
      inventory_snapshots: { ledger_id: "INTEGER NOT NULL DEFAULT 0" },
    };
    for (const [table, fields] of Object.entries(additions)) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
      }[];
      for (const [name, type] of Object.entries(fields))
        if (!cols.some((c) => c.name === name))
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS imported_order_number ON sales_orders(channel COLLATE NOCASE,order_number COLLATE NOCASE) WHERE order_number IS NOT NULL",
    );
    if (
      !db
        .prepare(
          "SELECT name FROM enhancement_migrations WHERE name='calendar-permissions-v1'",
        )
        .get()
    ) {
      const canonical = (p: Record<string, string[]>) =>
        JSON.stringify(
          Object.entries(p)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, [...v].sort()]),
        );
      for (const row of db
        .prepare(
          "SELECT user_id,role,permissions FROM organization_memberships",
        )
        .all() as { user_id: string; role: Role; permissions: string }[]) {
        const previous = JSON.parse(row.permissions),
          current = defaults(row.role),
          old = Object.fromEntries(
            Object.entries(current).filter(
              ([k]) => !["calendar", "content"].includes(k),
            ),
          );
        if (
          canonical(previous) === canonical(old) &&
          !db
            .prepare(
              "SELECT user_id FROM user_permission_overrides WHERE user_id=? LIMIT 1",
            )
            .get(row.user_id)
        )
          db.prepare(
            "UPDATE organization_memberships SET permissions=? WHERE user_id=?",
          ).run(JSON.stringify(current), row.user_id);
      }
      db.prepare(
        "INSERT INTO enhancement_migrations(name) VALUES('calendar-permissions-v1')",
      ).run();
    }
    if (
      !db
        .prepare(
          "SELECT name FROM enhancement_migrations WHERE name='inventory-baseline-v1'",
        )
        .get()
    ) {
      db.prepare(
        "INSERT INTO inventory_snapshots(item_type,item_id,location,quantity,unit_cost,ledger_id) SELECT 'product',p.id,l.location,l.quantity,p.cost_per_unit,(SELECT COALESCE(MAX(id),0) FROM inventory_ledger) FROM products p JOIN product_locations l ON l.product_id=p.id",
      ).run();
      db.prepare(
        "INSERT INTO inventory_snapshots(item_type,item_id,location,quantity,unit_cost,ledger_id) SELECT 'material',id,location,stock_quantity,cost_per_unit,(SELECT COALESCE(MAX(id),0) FROM inventory_ledger) FROM materials",
      ).run();
      db.prepare(
        "INSERT INTO enhancement_migrations(name) VALUES('inventory-baseline-v1')",
      ).run();
    }
  }).immediate();
}
