import {featureApi} from '@/lib/featureApi';
import {db,ensureDatabase} from '@/lib/db';
import {material,saveMaterial} from '@/lib/materialStore';
import {materialForViewer} from '@/lib/materialAccess';
import {can} from '@/lib/permissions';
function response(id:number,user:Parameters<typeof can>[0]) {
 return materialForViewer(material(id),user);
}
export const GET=featureApi('materials','view',async(req,user)=>{
 ensureDatabase(); const p=new URL(req.url).searchParams;
 if(p.has('history')){const history=db.prepare('SELECT id,delta,balance,kind,reason,created_at,recorded_unit,unit_cost FROM inventory_ledger WHERE material_id=? ORDER BY id DESC LIMIT 200').all(Number(p.get('history'))) as Record<string,unknown>[];if(!can(user,'materialCosts'))history.forEach(row=>delete row.unit_cost);return Response.json({history});}
 if(p.has('id')) return Response.json({material:response(Number(p.get('id')),user)});
 const ids=db.prepare('SELECT id FROM materials WHERE archived=? ORDER BY name').all(p.get('archived')==='1'?1:0) as {id:number}[];
 return Response.json({materials:ids.map(m=>response(m.id,user))});
});
export const POST=featureApi('materials','create',async(req,user)=>{
 const p=await req.json();if(!can(user,'materialCosts','edit') && (Number(p.cost_per_unit)||Number(p.purchase_price)||p.apply_purchase_cost||p.supplier_links?.some((link:{purchase_price?:unknown})=>Number(link.purchase_price)))) throw Error('Material cost editing permission required.');
 const id=saveMaterial(p);return Response.json({ok:true,id,sku:material(id).sku});
});
export const PATCH=featureApi('materials','edit',async(req,user)=>{
 const p=await req.json();const old=material(Number(p.id));
 if(p.action==='archive'){db.prepare('UPDATE materials SET archived=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(p.archived===false?0:1,p.id);return Response.json({ok:true});}
 if(!can(user,'materialCosts','edit')) {p.cost_per_unit=old.cost_per_unit;p.purchase_price=[old,...(old.supplier_links??[])].find((link:{supplier_uuid:string|null})=>link.supplier_uuid===p.supplier_uuid)?.purchase_price??0;if(p.apply_purchase_cost)throw Error('Material cost editing permission required.');if(p.supplier_links)p.supplier_links=p.supplier_links.map((link:{supplier_uuid:string})=>({...link,purchase_price:[old,...(old.supplier_links??[])].find((saved:{supplier_uuid:string})=>saved.supplier_uuid===link.supplier_uuid)?.purchase_price??0}));}
 const id=saveMaterial(p,Number(p.id));return Response.json({ok:true,id,sku:material(id).sku});
});
export const DELETE=featureApi('materials','delete',async(req)=>{
 const p=await req.json();if(p.confirm!==true)throw Error('Confirm material deletion.');
 db.transaction(()=>{
 const m=material(Number(p.id));
 if(db.prepare('SELECT value FROM generated_inventory_codes WHERE material_id=? LIMIT 1').get(p.id) || m.stock_quantity!==0 || db.prepare('SELECT id FROM recipe_items WHERE material_id=? OR item_name=? LIMIT 1').get(p.id,m.name) || db.prepare('SELECT id FROM inventory_ledger WHERE material_id=? LIMIT 1').get(p.id) || db.prepare('SELECT id FROM material_images WHERE material_id=? LIMIT 1').get(p.id) || db.prepare('SELECT id FROM barcode_scans WHERE material_id=? LIMIT 1').get(p.id))throw Error('This material has inventory, images, or historical dependencies. Archive it to preserve records.');
 db.prepare('DELETE FROM material_suppliers WHERE material_id=?').run(p.id);
 db.prepare('DELETE FROM material_barcodes WHERE material_id=?').run(p.id);db.prepare('DELETE FROM materials WHERE id=?').run(p.id);
 }).immediate(); return Response.json({ok:true});
});
