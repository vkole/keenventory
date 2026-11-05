import type Database from 'better-sqlite3';
import {categoryInput,categoryKey,type MaterialCategory} from './materialCategories';
export function getCategory(db:Database.Database,id:number){const row=db.prepare('SELECT * FROM material_categories WHERE id=? AND organization_id=1').get(id) as MaterialCategory|undefined;if(!row)throw Error('Category not found in this organization.');return row;}
export function registerCategory(db:Database.Database,input:unknown){const p=categoryInput.parse(input),key=categoryKey(p.name);return db.transaction(()=>{
 const found=db.prepare('SELECT * FROM material_categories WHERE organization_id=1 AND name_key=?').get(key) as MaterialCategory|undefined;
 if(found){if(found.archived)throw Error('This category is archived. Restore it before assigning new materials.');return found;}
 const result=db.prepare('INSERT INTO material_categories(name,name_key,description) VALUES (?,?,?)').run(p.name,key,p.description);return getCategory(db,Number(result.lastInsertRowid));
 }).immediate();}
export function resolveCategory(db:Database.Database,id:number|null|undefined,name:string,currentId?:number){const found=id?getCategory(db,id):db.prepare('SELECT * FROM material_categories WHERE organization_id=1 AND name_key=?').get(categoryKey(name||'Miscellaneous Materials')) as MaterialCategory|undefined;
 if(found){if(found.archived&&found.id!==currentId)throw Error('This category is archived. Choose an active category.');return found;}
 return registerCategory(db,{name:name||'Miscellaneous Materials'});
}
