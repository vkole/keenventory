import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {TestRequest,setupTestOwner} from './authTestSupport';
import {categoryKey} from './materialCategories';
test('categories persist, migrate case variants, propagate renames, archive safely and enforce permissions',async()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'keen-categories-'));process.env.KEENVENTORY_DATA_DIR=folder;const {db}=await import('./db');await setupTestOwner();
 try{
 const route=await import('../app/api/material-categories/route');const {saveMaterial,material}=await import('./materialStore');const {initializeCategories}=await import('./categorySchema');
 const request=(body:unknown,method='POST')=>new TestRequest('http://localhost/api/material-categories',{method,body:JSON.stringify(body)});
 const old=db.prepare('SELECT id,sku,stock_quantity FROM materials ORDER BY id').all();const history=db.prepare('SELECT * FROM inventory_ledger ORDER BY id').all();
 const first=Number(db.prepare("INSERT INTO materials(name,sku,category,stock_quantity) VALUES ('Old dye','OLD-DYE','Candle Dyes',12)").run().lastInsertRowid);
 const second=Number(db.prepare("INSERT INTO materials(name,sku,category,stock_quantity) VALUES ('Old dye 2','OLD-DYE-2','candle dyes',6)").run().lastInsertRowid);
 initializeCategories(db);const one=material(first),two=material(second);assert.ok(one.category_id);assert.equal(one.category_id,two.category_id);assert.equal(one.category,'Candle Dyes');assert.equal(one.stock_quantity,12);assert.equal(two.stock_quantity,6);
 assert.deepEqual(db.prepare('SELECT id,sku,stock_quantity FROM materials WHERE id NOT IN (?,?) ORDER BY id').all(first,second),old);assert.deepEqual(db.prepare('SELECT * FROM inventory_ledger ORDER BY id').all(),history);
 const responses=await Promise.all(['New Shared Category','new shared category',' NEW   SHARED CATEGORY '].map(name=>route.POST(request({name}))));const values=await Promise.all(responses.map(async r=>{assert.equal(r.status,200);return (await r.json()).category;}));assert.equal(new Set(values.map(c=>c.id)).size,1);
 const category=values[0];assert.equal(categoryKey(category.name),'new shared category');
 const created=saveMaterial({name:'Categorized Wick',category_id:category.id,category:'Stale cached text'});assert.equal(material(created).category,category.name);assert.equal(material(created).category_id,category.id);
 const typed=saveMaterial({name:'Name-only category legacy client',category:'Custom Packaging Type'});const typedMaterial=material(typed);assert.ok(typedMaterial.category_id);assert.equal((await (await route.GET(new TestRequest('http://localhost/api/material-categories'))).json()).categories.some((c:{id:number})=>c.id===typedMaterial.category_id),true);
 const rename=await route.PATCH(request({id:category.id,action:'update',name:'Renamed Shared Category',description:'Shared supplies'},'PATCH'));assert.equal(rename.status,200);assert.equal(material(created).category,'Renamed Shared Category');assert.equal((db.prepare('SELECT category FROM materials WHERE id=?').get(created) as {category:string}).category,'Renamed Shared Category');
 saveMaterial({...material(created),category:category.name,description:'Saved from stale form'},created);assert.equal(material(created).category,'Renamed Shared Category');
 assert.equal((await route.PATCH(request({id:category.id,action:'update',name:'Candle Wax'},'PATCH'))).status,400);
 assert.equal((await route.DELETE(request({id:category.id,confirm:true},'DELETE'))).status,400);assert.throws(()=>db.prepare('DELETE FROM material_categories WHERE id=?').run(category.id),/Reassign/);
 assert.equal((await route.PATCH(request({id:category.id,action:'archive'},'PATCH'))).status,200);assert.equal(material(created).category_id,category.id);
 let visible=(await (await route.GET(new TestRequest('http://localhost/api/material-categories'))).json()).categories;assert.equal(visible.some((c:{id:number})=>c.id===category.id),false);
 const existingList=(await (await route.GET(new TestRequest('http://localhost/api/material-categories?include_id='+category.id))).json()).categories;assert.equal(existingList.some((c:{id:number})=>c.id===category.id),true);
 saveMaterial({...material(created),description:'Still editable'},created);assert.throws(()=>saveMaterial({name:'New assignment',category_id:category.id}),/archived/);
 const persisted=new Database(path.join(folder,'keenventory.db'));try{const row=persisted.prepare('SELECT id,archived,name FROM material_categories WHERE id=?').get(category.id) as {id:number;archived:number;name:string};assert.equal(row.archived,1);assert.equal(row.name,'Renamed Shared Category');}finally{persisted.close();}
 initializeCategories(db);assert.equal((db.prepare('SELECT archived FROM material_categories WHERE id=?').get(category.id) as {archived:number}).archived,1);
 assert.equal((await route.PATCH(request({id:category.id,action:'restore'},'PATCH'))).status,200);
 assert.equal((await route.PATCH(request({id:category.id,action:'reassign',target_id:typedMaterial.category_id},'PATCH'))).status,200);assert.equal(material(created).category_id,typedMaterial.category_id);assert.equal(material(created).category,'Custom Packaging Type');
 assert.equal((await route.DELETE(request({id:category.id,confirm:true},'DELETE'))).status,200);
 const user=db.prepare("SELECT user_id FROM organization_memberships WHERE role='Owner'").get() as {user_id:string};db.prepare("UPDATE organization_memberships SET role='View Only',permissions=? WHERE user_id=?").run(JSON.stringify({materials:['view']}),user.user_id);
 assert.equal((await route.GET(new TestRequest('http://localhost/api/material-categories'))).status,200);assert.equal((await route.POST(request({name:'Forbidden'}))).status,403);assert.equal((await route.PATCH(request({id:one.category_id,action:'archive'},'PATCH'))).status,403);assert.equal((await route.DELETE(request({id:one.category_id,confirm:true},'DELETE'))).status,403);assert.equal((await route.GET(new Request('http://localhost/api/material-categories'))).status,401);
 }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
