import {featureApi} from '@/lib/featureApi';
import {db} from '@/lib/db';
import {material} from '@/lib/materialStore';
import {audit,requirePermission} from '@/lib/access';
import {z} from 'zod';
import Decimal from 'decimal.js';
const schema=z.object({expected_unit_version:z.number().int().nonnegative().optional(),material_id:z.number().int().positive(),type:z.enum(['add','remove','count']),quantity:z.number().finite().nonnegative(),expected_quantity:z.number().finite(),reason:z.string().trim().min(1).max(500),notes:z.string().max(4000),date:z.string().date(),request_key:z.string().uuid(),confirm:z.literal(true)});
export const POST=featureApi('adjustments','create',async(req,user)=>{
 requirePermission(user,'materials','view');const p=schema.parse(await req.json());
 db.transaction(()=>{
 const previous=db.prepare('SELECT * FROM material_adjustment_requests WHERE request_key=?').get(p.request_key) as {user_id:string;details:string}|undefined;
 if(previous){if(previous.user_id!==user.id || previous.details!==JSON.stringify(p))throw Error('Adjustment key already used.');return;}
 const m=material(p.material_id);if((m.unit_version??0)>0&&p.expected_unit_version!==m.unit_version)throw Error('Tracking units changed. Reload the material before adjusting inventory.');if(m.archived)throw Error('Restore this material before adjusting stock.');
 if(m.stock_quantity!==p.expected_quantity)throw Error('Stock changed. Reload the material and review the adjustment again.');
 const next=new Decimal(p.type==='count'?p.quantity:m.stock_quantity).plus(p.type==='add'?p.quantity:p.type==='remove'?-p.quantity:0).toDecimalPlaces(6).toNumber();
 if(next<0)throw Error('Cannot remove more than available stock.');if(next<m.reserved_quantity)throw Error('This adjustment would consume stock reserved for manufacturing. Review the planned batches first.');const delta=new Decimal(next).minus(m.stock_quantity).toNumber();
 db.prepare('UPDATE materials SET stock_quantity=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next,p.material_id);
 const result=db.prepare('INSERT INTO adjustments(item_name,quantity,reason) VALUES (?,?,?)').run(m.name,delta,p.reason);
 db.prepare("INSERT INTO inventory_ledger(material_id,location,delta,balance,kind,reason,reference_type,reference_id,request_key,unit_cost) VALUES (?,?,?,?,'Adjustment',?,'adjustment',?,?,?)").run(m.id,m.location,delta,next,`${p.reason}\n${p.notes}\nEffective date: ${p.date}; user: ${user.id}`,result.lastInsertRowid,p.request_key,m.cost_per_unit);
 db.prepare('INSERT INTO material_adjustment_requests VALUES (?,?,?,?)').run(p.request_key,m.id,user.id,JSON.stringify(p));
 audit(user,'Material inventory adjustment',String(m.id),true,{...p,before:m.stock_quantity,after:next,delta,unit:m.unit});
 }).immediate();return Response.json({ok:true});
});
