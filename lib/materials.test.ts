import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {TestRequest,setupTestOwner} from './authTestSupport';
import {stockStatus,safeSupplierURL} from './materialValidation';
test('material stock statuses and supplier URLs',()=>{
 assert.equal(stockStatus(0,8),'Out of Stock');assert.equal(stockStatus(-1,8),'Out of Stock');assert.equal(stockStatus(6,8),'Low Stock');assert.equal(stockStatus(8,8),'Low Stock');assert.equal(stockStatus(9,8),'In Stock');
 assert.equal(safeSupplierURL('https://example.com/wax'),'https://example.com/wax');for(const url of ['http://example.com','javascript:alert(1)','https://user:pass@example.com','https://127.0.0.1','https://localhost'])assert.throws(()=>safeSupplierURL(url));
});
test('materials, barcodes, image persistence, adjustments and permissions integrate with the ledger',async()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'keen-material-'));process.env.KEENVENTORY_DATA_DIR=folder;process.env.KEENVENTORY_MEDIA_STORAGE='disk';
 const {db}=await import('./db');await setupTestOwner();
 try{
 const route=await import('../app/api/materials/route');const barcode=await import('../app/api/barcode/route');const adjust=await import('../app/api/materials/adjust/route');const images=await import('../app/api/materials/images/route');const {material,saveMaterial}=await import('./materialStore');
 const p={name:'Blaque Fragrance Oil',sku:'MAT-BLAQUE-FO',stock_quantity:32,reorder_threshold:8,unit:'oz',barcodes:[{value:'001234567890',type:'UPC_A',package_quantity:16,package_unit:'oz'}]};
 const request=(url:string,body:unknown,method='POST')=>new TestRequest('http://localhost'+url,{method,body:JSON.stringify(body)});
 const created=await route.POST(request('/api/materials',p));assert.equal(created.status,200);const {id}=await created.json();
 assert.equal(material(id).stock_quantity,32);saveMaterial({...p,description:'Updated',stock_quantity:999},id);assert.equal(material(id).stock_quantity,32);
 assert.throws(()=>saveMaterial({...p,sku:'DUPLICATE'}),/already assigned/);assert.equal(db.prepare('SELECT id FROM materials WHERE sku=?').get('DUPLICATE'),undefined);
 const found=await barcode.POST(request('/api/barcode',{value:'001234567890'}));assert.equal((await found.json()).material.id,id);await barcode.POST(request('/api/barcode',{value:'001234567890'}));assert.equal((db.prepare('SELECT COUNT(*) n FROM barcode_scans').get() as {n:number}).n,1);
 assert.equal((await (await barcode.POST(request('/api/barcode',{value:'not-real'}))).json()).material,null);
 const adjustment={material_id:id,type:'count',quantity:6,expected_quantity:32,reason:'Physical count',notes:'Checked bottle',date:'2026-11-05',request_key:randomUUID(),confirm:true};
 assert.equal((await adjust.POST(request('/api/materials/adjust',adjustment))).status,200);assert.equal((await adjust.POST(request('/api/materials/adjust',adjustment))).status,200);assert.equal(material(id).stock_quantity,6);assert.equal(material(id).stock_status,'Low Stock');
 assert.equal((await adjust.POST(request('/api/materials/adjust',{...adjustment,request_key:randomUUID()}))).status,400);assert.equal(material(id).stock_quantity,6);
 assert.ok(db.prepare("SELECT id FROM inventory_ledger WHERE material_id=? AND kind='Adjustment'").get(id));assert.ok(db.prepare("SELECT id FROM audit_logs WHERE action='Material inventory adjustment'").get());
 const png=await sharp({create:{width:10,height:10,channels:3,background:'red'}}).png().toBuffer();const form=new FormData();form.set('material_id',String(id));form.set('file',new File([new Uint8Array(png)],'oil.png',{type:'image/png'}));
 assert.equal((await images.POST(new TestRequest('http://localhost/api/materials/images',{method:'POST',body:form}))).status,200);
 const image=(material(id).images as {id:number}[])[0];const read=await images.GET(new TestRequest('http://localhost/api/materials/images?id='+image.id));assert.equal(read.status,200);assert.equal((await sharp(Buffer.from(await read.arrayBuffer())).metadata()).format,'webp');
 const receive=await import('../app/api/materials/receive/route');const receipt={material_id:id,purchase_id:null,quantity:16,unit_cost:2,supplier:'Saved supplier',request_key:randomUUID(),confirm:true};
 assert.equal((await receive.POST(request('/api/materials/receive',receipt))).status,200);assert.equal((await receive.POST(request('/api/materials/receive',receipt))).status,200);assert.equal(material(id).stock_quantity,22);assert.equal(material(id).stock_status,'In Stock');
 const batch=Number(db.prepare("INSERT INTO manufacturing_batches(status,recipe_snapshot) VALUES ('Scheduled',?)").run(JSON.stringify({plan:{availability:[{id,required:5}]}})).lastInsertRowid);
 assert.equal(material(id).reserved_quantity,5);assert.equal(material(id).available_quantity,17);
 assert.equal((await adjust.POST(request('/api/materials/adjust',{...adjustment,type:'remove',quantity:18,expected_quantity:22,request_key:randomUUID()}))).status,400);assert.equal(material(id).stock_quantity,22);db.prepare('DELETE FROM manufacturing_batches WHERE id=?').run(batch);
 assert.equal((await barcode.GET(new TestRequest('http://localhost/api/barcode'))).status,200);
 assert.equal((await images.DELETE(request('/api/materials/images',{material_id:id,image_id:image.id,confirm:true},'DELETE'))).status,200);assert.equal(material(id).images.length,0);
 assert.equal((await route.DELETE(request('/api/materials',{id,confirm:true},'DELETE'))).status,400);
 assert.equal((await route.GET(new Request('http://localhost/api/materials'))).status,401);
 const user=db.prepare("SELECT user_id FROM organization_memberships WHERE role='Owner'").get() as {user_id:string};db.prepare("UPDATE organization_memberships SET role='View Only',permissions=? WHERE user_id=?").run(JSON.stringify({materials:['view']}),user.user_id);
 assert.equal((await adjust.POST(request('/api/materials/adjust',{...adjustment,request_key:randomUUID()}))).status,403);assert.equal((await route.PATCH(request('/api/materials',{...p,id},'PATCH'))).status,403);assert.equal((await (await route.GET(new TestRequest('http://localhost/api/materials?id='+id))).json()).material.purchase_price,undefined);
 }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
