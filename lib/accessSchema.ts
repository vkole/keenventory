import type Database from "better-sqlite3";
import { defaults, features, roles } from "./permissions";
export function initializeAccess(db: Database.Database) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS organizations(id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL);
      INSERT OR IGNORE INTO organizations(id,name) VALUES(1,'Keen Scents');
      CREATE TABLE IF NOT EXISTS organization_memberships(user_id TEXT PRIMARY KEY,organization_id INTEGER NOT NULL DEFAULT 1 CHECK(organization_id=1),role TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Active',permissions TEXT NOT NULL,last_login TEXT);
      CREATE TABLE IF NOT EXISTS user_profiles(user_id TEXT PRIMARY KEY,notifications INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS profile_images(user_id TEXT PRIMARY KEY,object_key TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS roles(name TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS permissions(feature TEXT NOT NULL,action TEXT NOT NULL,PRIMARY KEY(feature,action));
      CREATE TABLE IF NOT EXISTS role_permissions(role TEXT NOT NULL,feature TEXT NOT NULL,action TEXT NOT NULL,PRIMARY KEY(role,feature,action));
      CREATE TABLE IF NOT EXISTS user_permission_overrides(user_id TEXT NOT NULL,feature TEXT NOT NULL,actions TEXT NOT NULL,PRIMARY KEY(user_id,feature));
      CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,organization_id INTEGER NOT NULL DEFAULT 1 CHECK(organization_id=1),email TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,permissions TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'Pending Invitation',created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY,organization_id INTEGER NOT NULL CHECK(organization_id=1),user_id TEXT,action TEXT NOT NULL,record TEXT,details TEXT NOT NULL,success INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT,'Audit records are immutable'); END;
      CREATE TABLE IF NOT EXISTS owner_claims(id INTEGER PRIMARY KEY CHECK(id=1),email TEXT NOT NULL,name TEXT NOT NULL,token_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER);
      CREATE TABLE IF NOT EXISTS auth_throttle(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS invitation_sessions(session_hash TEXT PRIMARY KEY,token_hash TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS invitation_requests(email TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'Pending',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    `);
    for (const role of roles) {
      db.prepare("INSERT OR IGNORE INTO roles VALUES(?)").run(role);
      for (const [f, list] of Object.entries(defaults(role)))
        for (const a of list)
          db.prepare(
            "INSERT OR IGNORE INTO role_permissions VALUES(?,?,?)",
          ).run(role, f, a);
    }
    for (const [f, list] of Object.entries(features))
      for (const a of list)
        db.prepare("INSERT OR IGNORE INTO permissions VALUES(?,?)").run(f, a);
    // A database is bound to one workspace. Do not enable a second tenant against
    // these legacy SQL queries; future multi-tenant support must scope every query.
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string }[];
    const business = [
      "materials",
      "products",
      "recipes",
      "recipe_items",
      "manufacturing_batches",
      "purchase_orders",
      "sales_orders",
      "adjustments",
      "suppliers",
      "stocktakes",
      "product_locations",
      "inventory_ledger",
      "product_events",
      "image_objects",
      "product_images",
      "sales_order_lines",
      "purchase_order_lines",
      "product_stocktakes",
      "shopify_mappings",
      "push_activity",
    ];
    for (const { name } of tables.filter((t) => business.includes(t.name))) {
      const cols = db.prepare(`PRAGMA table_info(${name})`).all() as {
        name: string;
      }[];
      if (!cols.some((c) => c.name === "organization_id"))
        db.exec(
          `ALTER TABLE ${name} ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1 CHECK(organization_id=1)`,
        );
    }
  }).immediate();
}
