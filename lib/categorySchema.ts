import type Database from 'better-sqlite3';
import {categoryName,categoryKey} from './materialCategories';
export function initializeCategories(db:Database.Database){db.transaction(()=>{
 db.exec(`CREATE TABLE IF NOT EXISTS material_categories(id INTEGER PRIMARY KEY,organization_id INTEGER NOT NULL DEFAULT 1 CHECK(organization_id=1),name TEXT NOT NULL,name_key TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',archived INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(organization_id,name_key));
 CREATE TABLE IF NOT EXISTS category_migrations(name TEXT PRIMARY KEY);`);
 const columns=db.prepare('PRAGMA table_info(materials)').all() as {name:string}[];
 if(!columns.some(c=>c.name==='category_id'))db.exec('ALTER TABLE materials ADD COLUMN category_id INTEGER REFERENCES material_categories(id)');
 const insert=(raw:string)=>{const name=categoryName(raw)||'Miscellaneous Materials',key=categoryKey(name);db.prepare('INSERT OR IGNORE INTO material_categories(name,name_key) VALUES (?,?)').run(name,key);return db.prepare('SELECT id,name FROM material_categories WHERE organization_id=1 AND name_key=?').get(key) as {id:number;name:string};};
 for(const row of db.prepare('SELECT id,category FROM materials WHERE category_id IS NULL ORDER BY id').all() as {id:number;category:string|null}[]){const category=insert(row.category??'');db.prepare('UPDATE materials SET category_id=?,category=? WHERE id=?').run(category.id,category.name,row.id);}
 if(!db.prepare("SELECT name FROM category_migrations WHERE name='material-categories-v1'").get()){
 for(const name of ['Candle Wax','Fragrance Oils','Miscellaneous Materials','Jar','Lid','Wick','Label','Packaging','Component'])insert(name);
 db.prepare("INSERT INTO category_migrations(name) VALUES('material-categories-v1')").run();
 }
 db.exec(`CREATE INDEX IF NOT EXISTS material_category_reference ON materials(category_id);
 CREATE TRIGGER IF NOT EXISTS material_category_rename AFTER UPDATE OF name ON material_categories BEGIN UPDATE materials SET category=NEW.name WHERE category_id=NEW.id; END;
 CREATE TRIGGER IF NOT EXISTS material_category_delete_guard BEFORE DELETE ON material_categories WHEN EXISTS(SELECT 1 FROM materials WHERE category_id=OLD.id) BEGIN SELECT RAISE(ABORT,'Reassign all materials before deleting this category.'); END;
 CREATE TRIGGER IF NOT EXISTS material_category_insert_guard BEFORE INSERT ON materials WHEN NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM material_categories WHERE id=NEW.category_id AND organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'Category not found in this organization.'); END;
 CREATE TRIGGER IF NOT EXISTS material_category_update_guard BEFORE UPDATE OF category_id ON materials WHEN NEW.category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM material_categories WHERE id=NEW.category_id AND organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'Category not found in this organization.'); END;`);
 }).immediate();}
