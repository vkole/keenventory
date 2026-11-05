import {randomUUID} from 'node:crypto';
import QRCode from 'qrcode';
import {featureApi} from '@/lib/featureApi';
import {db} from '@/lib/db';
import {material} from '@/lib/materialStore';
import {z} from 'zod';
const escapeHTML=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const POST=featureApi('materials','edit',async(req)=>{
 const {material_id}=z.object({material_id:z.number().int().positive()}).parse(await req.json());
 const id=db.transaction(()=>{
 const m=material(material_id);if(m.archived)throw Error('Restore the material before generating a code.');
 const count=db.prepare('SELECT COUNT(*) n FROM material_barcodes WHERE material_id=?').get(material_id) as {n:number};if(count.n>=50)throw Error('Maximum 50 registered codes per material. Deactivate or reuse an existing code.');
 const value='KEENVENTORY:'+randomUUID();
 db.prepare('INSERT INTO generated_inventory_codes(value,material_id) VALUES (?,?)').run(value,material_id);
 return Number(db.prepare("INSERT INTO material_barcodes(material_id,value,type,package_quantity,package_unit) VALUES (?,?,'QR_CODE',1,?)").run(material_id,value,m.unit).lastInsertRowid);
 }).immediate();
 const code=db.prepare('SELECT * FROM material_barcodes WHERE id=?').get(id) as Record<string,unknown>;
 return Response.json({code:{...code,active:true}});
});
export const GET=featureApi('materials','view',async(req)=>{
 const params=new URL(req.url).searchParams;
 const code=db.prepare("SELECT b.*,m.name,m.sku FROM material_barcodes b JOIN materials m ON m.id=b.material_id WHERE b.id=? AND b.type='QR_CODE' AND b.active=1").get(Number(params.get('id'))) as {id:number;value:string;name:string;sku:string}|undefined;
 if(!code)return new Response('Active QR code not found.',{status:404});
 const png=await QRCode.toBuffer(code.value,{type:'png',width:480,margin:4,errorCorrectionLevel:'M'});
 if(params.has('print'))return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Inventory QR Label</title><style>body{font-family:sans-serif;text-align:center}img{width:240px;height:240px}@media print{button{display:none}}</style></head><body><h1>${escapeHTML(code.name)}</h1><p>${escapeHTML(code.sku)}</p><img alt="Inventory QR code" src="data:image/png;base64,${png.toString('base64')}"><p>${escapeHTML(code.value)}</p><button onclick="window.print()">Print Label</button></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
 return new Response(new Uint8Array(png),{headers:{'Content-Type':'image/png','X-Content-Type-Options':'nosniff',...(params.has('download')?{'Content-Disposition':`attachment; filename="keenventory-qr-${code.id}.png"`}:{})}});
});
