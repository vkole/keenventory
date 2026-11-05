import {featureApi} from '@/lib/featureApi';
import {requirePermission,audit} from '@/lib/access';
import {db} from '@/lib/db';
import {material} from '@/lib/materialStore';
import {z} from 'zod';
import Decimal from 'decimal.js';
const schema=z.object({material_id:z.number().int().positive(),purchase_id:z.number().int().positive().nullable(),quantity:z.number().finite().positive(),unit_cost:z.number().finite().nonnegative(),supplier:z.string().trim().min(1).max(500),request_key:z.string().uuid(),confirm:z.literal(true)});
export const POST=featureApi('purchases','create',async(req,user)=>{
 requirePermission(user,'materials','view');requirePermission(user,'materialCosts','edit');
 const p=schema.parse(await req.json());
 const purchaseId=db.transaction(()=>{
 const old=db.prepare('SELECT * FROM material_receipts WHERE request_key=?').get(p.request_key) as {purchase_id:number;user_id:string;details:string}|undefined;
 if(old){if(old.user_id!==user.id||old.details!==JSON.stringify(p))throw Error('Receipt key already used.');return old.purchase_id;}
 const m=material(p.material_id);if(m.archived)throw Error('Restore this material before receiving stock.');
 let id=p.purchase_id;
 if(id&&!db.prepare('SELECT id FROM purchase_orders WHERE id=?').get(id))throw Error('Purchase order not found.');
 const total=new Decimal(p.quantity).times(p.unit_cost).toNumber();
 if(!id)id=Number(db.prepare("INSERT INTO purchase_orders(supplier,status,total_cost) VALUES (?,'Received',?)").run(p.supplier,total).lastInsertRowid);
 const next=new Decimal(m.stock_quantity).plus(p.quantity).toDecimalPlaces(6).toNumber();
 const cost=new Decimal(m.stock_quantity).times(m.cost_per_unit).plus(total).div(next).toDecimalPlaces(6).toNumber();
 db.prepare('UPDATE materials SET stock_quantity=?,cost_per_unit=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next,cost,m.id);
 db.prepare('INSERT INTO material_receipts(material_id,purchase_id,quantity,unit_cost,user_id,request_key,details) VALUES (?,?,?,?,?,?,?)').run(m.id,id,p.quantity,p.unit_cost,user.id,p.request_key,JSON.stringify(p));
 db.prepare("INSERT INTO inventory_ledger(material_id,location,delta,balance,kind,reason,reference_type,reference_id,request_key,unit_cost) VALUES (?,?,?,?,'Purchase receipt',?,'purchase',?,?,?)").run(m.id,m.location,p.quantity,next,p.supplier,id,p.request_key,p.unit_cost);
 audit(user,'Material purchase received',String(m.id),true,{...p,purchase_id:id,before:m.stock_quantity,after:next});return id;
 }).immediate();return Response.json({ok:true,purchase_id:purchaseId});
});
