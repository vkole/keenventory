import {featureApi} from '@/lib/featureApi';
import {requirePermission,audit} from '@/lib/access';
import {db} from '@/lib/db';
import {material} from '@/lib/materialStore';
import {z} from 'zod';
import Decimal from 'decimal.js';
import {convertPurchaseQuantity} from '@/lib/purchaseUnits';
import {supplier} from '@/lib/supplierStore';
import {unitCostSchema,unitCostMicros} from '@/lib/unitCosts';
const schema=z.object({purchase_units:z.number().finite().positive().optional(),supplier_uuid:z.string().uuid().optional(),material_id:z.number().int().positive(),purchase_id:z.number().int().positive().nullable(),quantity:z.number().finite().positive(),unit_cost:unitCostSchema,supplier:z.string().trim().min(1).max(500),request_key:z.string().uuid(),confirm:z.literal(true)});
export const POST=featureApi('purchases','create',async(req,user)=>{
 requirePermission(user,'materials','view');requirePermission(user,'materialCosts','edit');
 const p=schema.parse(await req.json());
 const purchaseId=db.transaction(()=>{
 const old=db.prepare('SELECT * FROM material_receipts WHERE request_key=?').get(p.request_key) as {purchase_id:number;user_id:string;details:string}|undefined;
 if(old){if(old.user_id!==user.id||old.details!==JSON.stringify(p))throw Error('Receipt key already used.');return old.purchase_id;}
 const m=material(p.material_id);if(m.archived)throw Error('Restore this material before receiving stock.');
 let id=p.purchase_id;
 if(id&&!db.prepare('SELECT id FROM purchase_orders WHERE id=?').get(id))throw Error('Purchase order not found.');
 let quantity=p.quantity,unitCost=p.unit_cost,supplierName=p.supplier,supplierUuid=p.supplier_uuid??m.supplier_uuid??null;
 let exactTotal=new Decimal(quantity).times(unitCost);
 if(supplierUuid)supplierName=supplier(supplierUuid).company_name;
 if(p.purchase_units!==undefined){
 const link=supplierUuid?db.prepare('SELECT * FROM material_suppliers WHERE material_id=? AND supplier_uuid=?').get(m.id,supplierUuid) as Record<string,any>|undefined:m;
 if(!link?.purchase_unit)throw Error('Configure purchase packaging before receiving purchase units.');
 const perPackage=convertPurchaseQuantity(link.purchase_quantity,link.quantity_unit||m.unit,m.unit);
 quantity=perPackage.times(p.purchase_units).toDecimalPlaces(6).toNumber();if(quantity<=0)throw Error('Converted receipt quantity is too small.');
 exactTotal=new Decimal(link.purchase_price).times(p.purchase_units);unitCost=exactTotal.div(quantity).toDecimalPlaces(6).toNumber();unitCostMicros(unitCost);
 }

 const total=exactTotal.toDecimalPlaces(2).toNumber();
 if(!id)id=Number(db.prepare("INSERT INTO purchase_orders(supplier,status,total_cost,supplier_uuid) VALUES (?,'Received',?,?)").run(supplierName,total,supplierUuid).lastInsertRowid);
 const next=new Decimal(m.stock_quantity).plus(quantity).toDecimalPlaces(6).toNumber();
 const cost=new Decimal(m.stock_quantity).times(m.cost_per_unit).plus(exactTotal).div(next).toDecimalPlaces(6).toNumber();
 db.prepare('UPDATE materials SET stock_quantity=?,cost_per_unit=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next,cost,m.id);
 db.prepare('UPDATE materials SET cost_per_unit_micros=? WHERE id=?').run(unitCostMicros(cost),m.id);
 db.prepare('INSERT INTO material_receipts(material_id,purchase_id,quantity,unit_cost,user_id,request_key,details,supplier_uuid) VALUES (?,?,?,?,?,?,?,?)').run(m.id,id,quantity,unitCost,user.id,p.request_key,JSON.stringify(p),supplierUuid);
 db.prepare("INSERT INTO inventory_ledger(material_id,location,delta,balance,kind,reason,reference_type,reference_id,request_key,unit_cost) VALUES (?,?,?,?,'Purchase receipt',?,'purchase',?,?,?)").run(m.id,m.location,quantity,next,supplierName,id,p.request_key,unitCost);
 audit(user,'Material purchase received',String(m.id),true,{...p,quantity,unit_cost:unitCost,supplier_uuid:supplierUuid,purchase_id:id,before:m.stock_quantity,after:next});return id;
 }).immediate();return Response.json({ok:true,purchase_id:purchaseId});
});
