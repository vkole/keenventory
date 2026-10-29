import { TestRequest as Request, setupTestOwner } from './authTestSupport';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { product,saveProduct,products,productDetail } from './productStore';
import { previewImport,importProducts,csvReport } from './productCsv';
import { filterProducts } from './productFilters';

test('product lifecycle, independent variations, ledger, inventory actions, imports and reports',async()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'keenventory-products-'));process.env.KEENVENTORY_DATA_DIR=folder;const {db}=await import('./db');await setupTestOwner();
 try{
 const {POST}=await import('../app/api/products/actions/route');
 const action=async(id:number,name:string,body:Record<string,unknown>={},ok=true)=>{const response=await POST(new Request('http://localhost/api/products/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:name,request_key:randomUUID(),...body})}));const data=await response.json();assert.equal(response.status,ok?200:400,JSON.stringify(data));return data;};
 const id=saveProduct(db,{name:'Test Candle',sku:'KS-TEST_12.OZ+&',stock_quantity:10,cost_per_unit:5,retail_price:28,wholesale_price:14,reorder_threshold:3,location:'Shelf A'});
 assert.equal(product(db,id).stock_quantity,10);assert.equal(productDetail(db,id).ledger.length,1);
 saveProduct(db,{...product(db,id),attributes:{},auto_manufacture:true,description:'Updated',stock_quantity:999,cost_per_unit:999});assert.equal(product(db,id).stock_quantity,10);assert.equal(product(db,id).cost_per_unit,5);assert.equal(product(db,id).description,'Updated');assert.equal(products(db).filter(p=>p.id===id).length,1);
 assert.throws(()=>saveProduct(db,{name:'Duplicate',sku:'ks-test_12.oz+&'}),/SKU already exists/);
 assert.throws(()=>saveProduct(db,{name:'Blank',sku:''}));
 await action(id,'attributes',{attributes:{Size:['12 oz','2 oz'],Scent:['Blaque']}});
 assert.throws(()=>saveProduct(db,{name:'Incomplete variation',sku:'INCOMPLETE-VARIATION',parent_id:id,attributes:{Size:'2 oz'}}),/Scent/);
 const variation=saveProduct(db,{name:'Travel Candle',sku:'KS-TRAVEL',parent_id:id,attributes:{Size:'2 oz',Scent:'Blaque'},stock_quantity:3,cost_per_unit:2,location:'Shelf A'});assert.equal(product(db,variation).stock_quantity,3);assert.equal(product(db,id).stock_quantity,10);
 await action(id,'attributes',{attributes:{Size:['12 oz'],Scent:['Blaque']}},false);
 const copy=await action(id,'copy',{name:'Copy',sku:'KS-COPY',copy_images:false});assert.equal(product(db,copy.id).stock_quantity,0);assert.equal(productDetail(db,copy.id).ledger.length,0);assert.equal(productDetail(db,copy.id).manufactures.length,0);
 const transferKey=randomUUID();await action(id,'transfer',{from:'Shelf A',to:'Shelf B',quantity:4,reason:'Move',request_key:transferKey});await action(id,'transfer',{from:'Shelf A',to:'Shelf B',quantity:4,reason:'Move',request_key:transferKey});assert.equal(product(db,id).stock_quantity,10);assert.equal(product(db,id).locations?.find(l=>l.location==='Shelf B')?.quantity,4);
 await action(id,'transfer',{from:'Shelf A',to:'Shelf B',quantity:99,reason:'Too much'},false);assert.equal(product(db,id).stock_quantity,10);
 await action(id,'adjust',{location:'Shelf A',quantity:-1,reason:'Breakage'});assert.equal(product(db,id).stock_quantity,9);
 await action(id,'order',{contact:'Customer',quantity:2,price:28,location:'Shelf A'});assert.equal(product(db,id).reserved,2);assert.equal(product(db,id).available,7);
 await action(id,'adjust',{location:'Shelf A',quantity:-4,reason:'Would consume reserved'},false);
 const order=productDetail(db,id).orders[0] as {id:number};await action(id,'fulfill',{line_id:order.id});await action(id,'fulfill',{line_id:order.id});assert.equal(product(db,id).stock_quantity,7);assert.equal(product(db,id).reserved,0);
 await action(id,'purchase',{contact:'Supplier',quantity:3,price:7,location:'Shelf B'});const purchase=productDetail(db,id).purchases[0] as {id:number};await action(id,'receive',{line_id:purchase.id});await action(id,'receive',{line_id:purchase.id});assert.equal(product(db,id).stock_quantity,10);assert.equal(product(db,id).cost_per_unit,5.6);
 await action(id,'stocktake',{quantity:6,location:'Shelf B',reason:'Physical count'});assert.equal(product(db,id).stock_quantity,9);assert.equal(productDetail(db,id).stocktakes.length,1);
 await action(id,'componentize',{quantity:1,location:'Shelf A',reason:'Convert packaging unit',sku:'COMP-TEST',confirm:true});assert.equal(product(db,id).stock_quantity,8);assert.equal((db.prepare('SELECT stock_quantity FROM materials WHERE sku=?').get('COMP-TEST') as {stock_quantity:number}).stock_quantity,1);
 assert.equal(filterProducts(products(db),new URLSearchParams({location:'Shelf B'})).find(p=>p.id===id)?.stock_quantity,6);
 const duplicateCsv='Product Name,SKU,Starting Quantity\nA,CSV-1,5\nB,csv-1,6\n';assert.ok(previewImport(db,duplicateCsv)[1].errors.includes('Duplicate SKU in CSV.'));assert.throws(()=>importProducts(db,duplicateCsv,'skip',false));
 const csv='Product Name,SKU,Starting Quantity,Unit Cost,Sale Price\nImported,CSV-2,7,4,25\n';importProducts(db,csv,'skip',false);const imported=products(db).find(p=>p.sku==='CSV-2')!;assert.equal(imported.stock_quantity,0);importProducts(db,'Product Name,SKU,Starting Quantity,Unit Cost,Sale Price\nRenamed,CSV-2,999,99,30\n','update',true);assert.equal(product(db,imported.id).stock_quantity,0);assert.equal(product(db,imported.id).cost_per_unit,4);assert.equal(product(db,imported.id).retail_price,30);
 importProducts(db,'Product Name,SKU,Starting Quantity\nOpening,CSV-3,8\n','skip',true);const opening=products(db).find(p=>p.sku==='CSV-3')!;assert.equal(opening.stock_quantity,8);assert.equal(productDetail(db,opening.id).ledger.length,1);
 assert.match(csvReport(products(db),['Product Name','SKU','On Hand']),/KS-TEST_12.OZ/);
 const exportRoute=await import('../app/api/products/export/route');for(const report of ['worksheet','prices','stock','custom']){const response=await exportRoute.GET(new Request(`http://localhost/api/products/export?report=${report}&status=all`));assert.equal(response.status,200);assert.match(response.headers.get('content-type')!,/text\/csv/);assert.ok((await response.text()).length>20);}
 const label=await (await import('../app/api/products/label/route')).GET(new Request(`http://localhost/api/products/label?id=${id}&qr=true`));assert.match(await label.text(),/data:image\/png;base64/);
 const mergeSource=saveProduct(db,{name:'Duplicate Stock',sku:'MERGE-SOURCE',stock_quantity:2,location:'Shelf A'});const mergeTarget=saveProduct(db,{name:'Target',sku:'MERGE-TARGET',stock_quantity:1,location:'Shelf A'});const preview=await action(mergeSource,'merge',{target_id:mergeTarget});assert.ok(preview.preview);await action(mergeSource,'merge',{target_id:mergeTarget,confirm:true});assert.equal(product(db,mergeTarget).stock_quantity,3);assert.equal(product(db,mergeSource).stock_quantity,0);assert.ok(product(db,mergeSource).archived_at);assert.ok(productDetail(db,mergeTarget).events.length>1);
 // Partial imports preserve fields omitted from the CSV and never rewrite SKU casing.
 const partial=saveProduct(db,{name:'Partial import',sku:'KEEP-CASE',category:'Custom',description:'Keep description',measurement_type:'oz',retail_price:31,wholesale_price:17,sale_quantity:2,reorder_threshold:4});
 importProducts(db,'Product Name,SKU,Sale Price\nUpdated name,keep-case,35\n','update',false);
 const kept=product(db,partial);assert.equal(kept.name,'Updated name');assert.equal(kept.sku,'KEEP-CASE');assert.equal(kept.retail_price,35);assert.equal(kept.category,'Custom');assert.equal(kept.description,'Keep description');assert.equal(kept.measurement_type,'oz');assert.equal(kept.wholesale_price,17);assert.equal(kept.sale_quantity,2);assert.equal(kept.reorder_threshold,4);
 const importRoute=await import('../app/api/products/import/route');
 const importRequest=(body:Record<string,unknown>)=>importRoute.POST(new Request('http://localhost/api/products/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
 const importCsv='Product Name,SKU,Starting Quantity\nPreview import,PREVIEW-IMPORT,4\n';
 const importPreview=await (await importRequest({csv:importCsv})).json();
 assert.equal((await importRequest({csv:importCsv,confirm:true,preview_hash:importPreview.hash,opening_balances:true})).status,400);
 assert.equal((await importRequest({csv:importCsv,confirm:true,preview_hash:importPreview.hash})).status,200);
 assert.equal((await importRequest({csv:importCsv,confirm:true,preview_hash:importPreview.hash})).status,400);
 // Cancelled transactions cannot change stock, and pending receipts block merging.
 const guarded=saveProduct(db,{name:'Guarded transactions',sku:'GUARDED',stock_quantity:5,location:'Shelf A'});
 await action(guarded,'order',{contact:'Cancelled customer',quantity:1,price:10,location:'Shelf A'});
 const cancelledOrder=productDetail(db,guarded).orders[0] as {id:number;order_id:number};db.prepare("UPDATE sales_orders SET status='Cancelled' WHERE id=?").run(cancelledOrder.order_id);
 await action(guarded,'fulfill',{line_id:cancelledOrder.id},false);assert.equal(product(db,guarded).stock_quantity,5);
 await action(guarded,'purchase',{contact:'Pending supplier',quantity:2,price:3,location:'Shelf A'});
 await action(guarded,'merge',{target_id:mergeTarget,confirm:true},false);assert.equal(product(db,guarded).stock_quantity,5);assert.equal(product(db,guarded).merged_into_id,null);
 const cancelledPurchase=productDetail(db,guarded).purchases[0] as {id:number;purchase_id:number};db.prepare("UPDATE purchase_orders SET status='Cancelled' WHERE id=?").run(cancelledPurchase.purchase_id);
 await action(guarded,'receive',{line_id:cancelledPurchase.id},false);assert.equal(product(db,guarded).stock_quantity,5);
 await action(id,'archive',{confirm:true});assert.ok(product(db,id).archived_at);assert.equal(productDetail(db,id).orders.length,1);assert.throws(()=>saveProduct(db,{name:'Duplicate archived',sku:product(db,id).sku}),/SKU already exists/);await action(id,'delete',{confirm:true},false);
 const safe=saveProduct(db,{name:'Safe deletion',sku:'SAFE-DELETE'});await action(safe,'delete',{confirm:true});assert.throws(()=>product(db,safe));
 }finally{db.close();delete process.env.KEENVENTORY_DATA_DIR;rmSync(folder,{recursive:true,force:true});}
});
