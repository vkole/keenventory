import {featureApi} from '@/lib/featureApi';
import {db} from '@/lib/db';
import {material} from '@/lib/materialStore';
import {can} from '@/lib/permissions';
export const GET=featureApi('materials','view',async(req)=>{
 const value=new URL(req.url).searchParams.get('value');
 if(value===null)return Response.json({scans:db.prepare('SELECT s.*,m.name,m.sku,(SELECT id FROM material_images WHERE material_id=m.id ORDER BY is_primary DESC,id LIMIT 1) image_id,COALESCE((SELECT name FROM user WHERE id=s.user_id),s.user_id) user_name FROM barcode_scans s JOIN materials m ON m.id=s.material_id ORDER BY s.id DESC LIMIT 30').all()});
 const b=db.prepare('SELECT material_id FROM material_barcodes WHERE value=? AND active=1').get(value) as {material_id:number}|undefined;
 return Response.json({material_id:b?.material_id??null});
});
// Scan history is an explicit lookup event, permitted to inventory viewers.
export const POST=featureApi('materials','view',async(req,user)=>{
 const p=await req.json();if(typeof p.value!=='string'||p.value.length>2048)throw Error('Enter a barcode or QR code value.');
 const b=db.prepare('SELECT material_id FROM material_barcodes WHERE value=? AND active=1').get(p.value.trim()) as {material_id:number}|undefined;
 if(!b)return Response.json({material:null});const m=material(b.material_id);
 const last=db.prepare('SELECT id FROM barcode_scans WHERE user_id=? AND value=? AND created_at>datetime(\'now\',\'-10 seconds\')').get(user.id,p.value.trim());
 if(!last)db.prepare('INSERT INTO barcode_scans(user_id,material_id,value,stock_status) VALUES (?,?,?,?)').run(user.id,m.id,p.value.trim(),m.stock_status);
 if(!can(user,'materialCosts')){delete m.cost_per_unit;delete m.cost_per_unit_micros;delete m.purchase_price;}
 return Response.json({material:m});
});
