import type Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import {generateSupplierCode} from './supplierValidation';
export function initializeSuppliers(db:Database.Database){db.transaction(()=>{
 for(const [table,fields] of Object.entries({suppliers:{uuid:'TEXT',supplier_code:'TEXT',address:"TEXT NOT NULL DEFAULT ''"},materials:{supplier_uuid:'TEXT',quantity_unit:"TEXT NOT NULL DEFAULT ''"},material_receipts:{supplier_uuid:'TEXT'},purchase_orders:{supplier_uuid:'TEXT'}})){
  const columns=db.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[];
  for(const [name,type] of Object.entries(fields))if(!columns.some(c=>c.name===name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
 }
 const suppliers=db.prepare('SELECT id,uuid,supplier_code,company_name FROM suppliers ORDER BY id').all() as {id:number;uuid:string|null;supplier_code:string|null;company_name:string}[];
 for(const s of suppliers){if(s.uuid&&s.supplier_code)continue;let code=s.supplier_code;if(!code){const base=generateSupplierCode(s.company_name)||'SUP-SUPPLIER';code=base;let i=2;while(db.prepare('SELECT id FROM suppliers WHERE organization_id=1 AND supplier_code=? COLLATE NOCASE AND id<>?').get(code,s.id))code=base+'-'+String(i++).padStart(3,'0');}db.prepare('UPDATE suppliers SET uuid=?,supplier_code=? WHERE id=?').run(s.uuid||randomUUID(),code,s.id);}
 db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS supplier_uuid_unique ON suppliers(uuid);
 CREATE UNIQUE INDEX IF NOT EXISTS supplier_business_code_unique ON suppliers(organization_id,supplier_code COLLATE NOCASE);
 CREATE TABLE IF NOT EXISTS material_suppliers(material_id INTEGER NOT NULL REFERENCES materials(id),supplier_uuid TEXT NOT NULL REFERENCES suppliers(uuid),supplier_sku TEXT NOT NULL DEFAULT '',product_url TEXT NOT NULL DEFAULT '',purchase_unit TEXT NOT NULL DEFAULT '',purchase_quantity REAL NOT NULL DEFAULT 1,quantity_unit TEXT NOT NULL DEFAULT '',purchase_price REAL NOT NULL DEFAULT 0,preferred_reorder_quantity REAL NOT NULL DEFAULT 0,lead_time_days INTEGER NOT NULL DEFAULT 0,is_primary INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(material_id,supplier_uuid));
 CREATE UNIQUE INDEX IF NOT EXISTS material_primary_supplier ON material_suppliers(material_id) WHERE is_primary=1;
 CREATE TABLE IF NOT EXISTS supplier_migrations(name TEXT PRIMARY KEY);
 `);
 if(!db.prepare("SELECT name FROM supplier_migrations WHERE name='supplier-links-v1'").get()){
 db.exec(`UPDATE materials SET supplier_uuid=(SELECT uuid FROM suppliers WHERE id=materials.supplier_id) WHERE supplier_id IS NOT NULL AND supplier_uuid IS NULL;
 INSERT OR IGNORE INTO material_suppliers(material_id,supplier_uuid,supplier_sku,product_url,purchase_unit,purchase_quantity,quantity_unit,purchase_price,preferred_reorder_quantity,lead_time_days,is_primary) SELECT id,supplier_uuid,supplier_sku,product_url,purchase_unit,purchase_quantity,unit,purchase_price,preferred_reorder_quantity,lead_time_days,1 FROM materials WHERE supplier_uuid IS NOT NULL;
 UPDATE materials SET quantity_unit=unit WHERE quantity_unit='';
 INSERT INTO supplier_migrations(name) VALUES('supplier-links-v1');`);
 }
 }).immediate();}
