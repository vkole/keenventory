import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import Decimal from 'decimal.js';
import {conversionFactor} from './materialUnits';
import {TestRequest,setupTestOwner} from './authTestSupport';
test('tracking units support weight, volume, aliases, count distinctions and approved custom factors',()=>{
 for(const [q,from,to,expected] of [[5,'lb','oz',80],[32,'oz','lb',2],[1,'kg','g',1000],[2,'L','ml',2000],[1,'gal','fl oz',128],[2,'Each','Pieces',2]] as const)assert.equal(new Decimal(q).times(conversionFactor(from,to)).toNumber(),expected);
 for(const [from,to] of [['g','ml'],['oz','Bottles'],['Each','lb'],['Packs','Each'],['fl oz','oz']])assert.throws(()=>conversionFactor(from,to),/incompatible/);
 assert.equal(conversionFactor('Bottle','ml',[{from_unit:'Bottle',to_unit:'fl oz',factor:'16'}]).toNumber(),473.176473);
});
test('unit changes preserve value, recipes and completed history, convert open batches and reject stale clients',async()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'keen-unit-change-'));process.env.KEENVENTORY_DATA_DIR=folder;const {db}=await import('./db');await setupTestOwner();
 try{
 const {saveMaterial,material}=await import('./materialStore');const {saveProduct}=await import('./productStore');const {createBatch,completeBatch,inventory}=await import('./manufacturing');const route=await import('../app/api/materials/units/route');const receive=await import('../app/api/materials/receive/route');const barcode=await import('../app/api/barcode/route');const {previewUnitChange}=await import('./unitChangeStore');const {normalizeMaterialHistory}=await import('./unitHistory');
 const req=(body:unknown,url='/api/materials/units')=>new TestRequest('http://localhost'+url,{method:'POST',body:JSON.stringify(body)});
 const id=saveMaterial({name:'Unit Change Soy Wax',sku:'UNIT-WAX',unit:'lb',stock_quantity:5,cost_per_unit:'3.20',reorder_threshold:1,preferred_reorder_quantity:2,barcodes:[{value:'UNIT-WAX-BARCODE',type:'CODE_128',package_quantity:1,package_unit:'lb'}]});
 const product=saveProduct(db,{name:'Unit Test Candle',sku:'UNIT-CANDLE'});const recipe=Number(db.prepare("INSERT INTO recipes(name,product_id,batch_yield,status) VALUES ('Unit Test Recipe',?,1,'Active')").run(product).lastInsertRowid);db.prepare("INSERT INTO recipe_items(recipe_id,material_id,item_name,quantity,unit,item_type) VALUES (?,?,?,0.5,'lb','material')").run(recipe,id,'Unit Change Soy Wax');
 const completed=createBatch(db,{request_key:randomUUID(),recipe_id:recipe,product_id:product,planned_quantity:1});completeBatch(db,{id:completed,actual_quantity:1,actual_minutes:0,hourly_labor_rate:0,consumption:[{material_id:id,quantity:0.5}]});
 assert.equal((await receive.POST(req({material_id:id,purchase_id:null,quantity:0.5,unit_cost:3.2,supplier:'Wax Supplier',request_key:randomUUID(),confirm:true},'/api/materials/receive'))).status,200);
 const completedBefore=db.prepare('SELECT * FROM manufacturing_batches WHERE id=?').get(completed);const receiptsBefore=db.prepare('SELECT * FROM material_receipts WHERE material_id=?').all(id);const open=createBatch(db,{request_key:randomUUID(),recipe_id:recipe,product_id:product,planned_quantity:1});
 const review=await route.POST(req({action:'preview',material_id:id,new_unit:'oz'}));assert.equal(review.status,200);const preview=(await review.json()).preview;assert.equal(preview.current_quantity,5);assert.equal(preview.converted_quantity,80);assert.equal(Number(preview.converted_cost),0.2);assert.equal(preview.current_value,'16.00');assert.equal(preview.converted_value,'16.00');assert.equal(preview.active_batch_count,1);
 const request={action:'commit',material_id:id,new_unit:'oz',token:preview.token,request_key:randomUUID(),confirm:true};assert.equal((await route.POST(req(request))).status,200);assert.equal((await route.POST(req(request))).status,200);
 assert.equal(material(id).unit,'oz');assert.equal(material(id).unit_id,'oz');assert.equal(material(id).stock_quantity,80);assert.equal(material(id).cost_per_unit,0.2);assert.equal(material(id).reorder_threshold,16);assert.equal(material(id).preferred_reorder_quantity,32);assert.equal(inventory(db).find(m=>m.id===id)?.reserved_quantity,8);
 const ingredient=db.prepare('SELECT quantity,unit FROM recipe_items WHERE recipe_id=?').get(recipe) as {quantity:number;unit:string};assert.deepEqual(ingredient,{quantity:8,unit:'oz'});
 assert.deepEqual(db.prepare('SELECT * FROM manufacturing_batches WHERE id=?').get(completed),completedBefore);assert.deepEqual(db.prepare('SELECT * FROM material_receipts WHERE material_id=?').all(id),receiptsBefore);
 assert.throws(()=>completeBatch(db,{id:open,actual_quantity:1,actual_minutes:0,hourly_labor_rate:0,consumption:[{material_id:id,quantity:8,unit_version:0}]}),/Tracking units changed/);
 completeBatch(db,{id:open,actual_quantity:1,actual_minutes:0,hourly_labor_rate:0,consumption:[{material_id:id,quantity:8,unit_version:1}]});assert.equal(material(id).stock_quantity,72);assert.equal((db.prepare('SELECT actual_cost FROM manufacturing_batches WHERE id=?').get(open) as {actual_cost:number}).actual_cost,1.6);
 const stockHistory=db.prepare('SELECT * FROM inventory_ledger WHERE material_id=? ORDER BY id').all(id) as Record<string,any>[];assert.equal(stockHistory[0].recorded_unit,'lb');assert.equal(stockHistory.at(-1)!.recorded_unit,'oz');const normalized=normalizeMaterialHistory(db,stockHistory,[material(id)],['delta','balance']);assert.equal(normalized[0].delta,80);assert.equal(stockHistory[0].delta,5);
 const scan=await barcode.POST(req({value:'UNIT-WAX-BARCODE'},'/api/barcode'));assert.equal((await scan.json()).material.unit,'oz');assert.ok(db.prepare("SELECT id FROM audit_logs WHERE action='Material tracking unit changed'").get());
 assert.throws(()=>saveMaterial({...material(id),unit:'g'},id),/Review and confirm/);
 const stale=previewUnitChange(db,id,'g').preview;db.prepare('UPDATE materials SET stock_quantity=stock_quantity+1 WHERE id=?').run(id);assert.equal((await route.POST(req({action:'commit',material_id:id,new_unit:'g',token:stale.token,request_key:randomUUID(),confirm:true}))).status,400);assert.equal(material(id).unit,'oz');
 const bottle=saveMaterial({name:'Unit Test Bottle',unit:'Bottles',stock_quantity:2,cost_per_unit:8,purchase_unit:'Bottle',purchase_quantity:1,quantity_unit:'Bottles',purchase_price:8});
 assert.equal((await route.POST(req({action:'preview',material_id:bottle,new_unit:'fl oz'}))).status,400);const bottlePreview=(await (await route.POST(req({action:'preview',material_id:bottle,new_unit:'fl oz',custom_factor:'16'}))).json()).preview;
 assert.equal((await route.POST(req({action:'commit',material_id:bottle,new_unit:'fl oz',custom_factor:'16',token:bottlePreview.token,request_key:randomUUID(),confirm:true}))).status,200);assert.equal(material(bottle).stock_quantity,32);assert.equal(material(bottle).cost_per_unit,0.5);
 assert.equal((await receive.POST(req({material_id:bottle,purchase_id:null,quantity:1,unit_cost:0,supplier:'Bottle Supplier',purchase_units:1,expected_unit_version:1,request_key:randomUUID(),confirm:true},'/api/materials/receive'))).status,200);assert.equal(material(bottle).stock_quantity,48);
 const membership=db.prepare("SELECT user_id FROM organization_memberships WHERE role='Owner'").get() as {user_id:string};db.prepare("UPDATE organization_memberships SET role='View Only',permissions=? WHERE user_id=?").run(JSON.stringify({materials:['view']}),membership.user_id);assert.equal((await route.POST(req({action:'preview',material_id:id,new_unit:'lb'}))).status,403);
 }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
