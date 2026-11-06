import type Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import Decimal from 'decimal.js';
import {conversionFactor,unitId,type UnitConversion} from './materialUnits';
import {materialUnitEdges} from './unitConversionStore';
import {parseUnitCost,unitCostMicros} from './unitCosts';
type Row=Record<string,any>;
function converted(value:unknown,factor:Decimal){const result=new Decimal(String(value??0)).times(factor).toDecimalPlaces(6);if(!result.isFinite()||result.abs().gt(Number.MAX_SAFE_INTEGER)||!new Decimal(String(value??0)).eq(0)&&result.eq(0))throw Error('The converted quantity exceeds supported precision. Use an explicit inventory migration.');return result.toNumber();}
export function previewUnitChange(db:Database.Database,id:number,newUnit:string,customFactor?:string){
 const m=db.prepare('SELECT * FROM materials WHERE id=?').get(id) as Row|undefined;if(!m)throw Error('Material not found.');
 const target=newUnit.trim().replace(/\s+/g,' ');if(!target||target.length>80)throw Error('Choose a tracking unit of at most 80 characters.');if(target===m.unit)throw Error('Select a different tracking unit.');
 const edges=materialUnitEdges(db,id);let factor:Decimal|null=null;
 try{factor=conversionFactor(m.unit,target,edges);}catch{}
 let custom=false;
 if(customFactor!==undefined&&customFactor!==''){if(!/^\d*(?:\.\d+)?$/.test(customFactor)||!new Decimal(customFactor).isFinite()||new Decimal(customFactor).lte(0)||new Decimal(customFactor).gt('1000000000000'))throw Error('Enter a positive material-specific factor no greater than 1,000,000,000,000.');const given=new Decimal(customFactor);if(factor&&!factor.eq(given))throw Error('The supplied factor conflicts with the standard or previously registered conversion.');if(!factor){factor=given;custom=true;}}
 if(!factor)throw Error('These units are incompatible. Enter a confirmed material-specific conversion factor; weight ounces and fluid ounces are different.');
 const allEdges:UnitConversion[]=[...edges,{from_unit:unitId(m.unit),to_unit:unitId(target),factor:factor.toString()}];
 const cost=new Decimal(m.cost_per_unit_exact??m.cost_per_unit),quantity=converted(m.stock_quantity,factor),newCost=cost.div(factor).toDecimalPlaces(12).toSignificantDigits(15);parseUnitCost(newCost.toFixed());if(cost.gt(0)&&newCost.eq(0))throw Error('The converted unit cost is below supported precision. Use an explicit inventory migration.');
 const recipeRows=db.prepare('SELECT * FROM recipe_items WHERE material_id=? OR (material_id IS NULL AND item_name=?) ORDER BY id').all(id,m.name) as Row[];
 const recipes:Row[]=recipeRows.map(row=>({...row,before:{quantity:row.quantity,unit:row.unit},quantity:converted(row.quantity,conversionFactor(row.unit,target,allEdges)),unit:target,material_id:id}));
 const batches=db.prepare("SELECT id,recipe_snapshot FROM manufacturing_batches WHERE status IN ('Draft','Scheduled','In Progress') AND recipe_snapshot IS NOT NULL ORDER BY id").all() as Row[];
 const active:Row[]=[];
 for(const batch of batches){const snapshot=JSON.parse(batch.recipe_snapshot);if(!snapshot.plan?.availability?.some((row:Row)=>row.id===id))continue;const next=JSON.parse(batch.recipe_snapshot);for(const row of next.plan.availability){if(row.id!==id)continue;const f=conversionFactor(row.unit,target,allEdges);for(const key of ['stock_quantity','reorder_threshold','reserved_quantity','per_unit','required','available','remaining'])if(row[key]!==undefined)row[key]=converted(row[key],f);row.cost_per_unit=new Decimal(row.cost_per_unit).div(f).toDecimalPlaces(12).toSignificantDigits(15).toNumber();row.unit=target;row.unit_version=(m.unit_version??0)+1;}
 for(const row of next.ingredients??[]){if(row.material_id!==id&&!(row.material_id==null&&row.item_name===m.name))continue;row.quantity=converted(row.quantity,conversionFactor(row.unit,target,allEdges));row.unit=target;}
 for(const row of next.plan.lines??[]){if(row.material_id!==id)continue;const f=conversionFactor(row.unit,target,allEdges);row.quantity=converted(row.quantity,f);row.required=converted(row.required,f);row.unit_cost=new Decimal(row.unit_cost).div(f).toDecimalPlaces(12).toSignificantDigits(15).toNumber();row.unit=target;}
 active.push({id:batch.id,before:batch.recipe_snapshot,after:JSON.stringify(next)});}
 const suppliers=db.prepare('SELECT * FROM material_suppliers WHERE material_id=? ORDER BY supplier_uuid').all(id);
 const lastLedger=(db.prepare('SELECT COALESCE(MAX(id),0) id FROM inventory_ledger WHERE material_id=?').get(id) as {id:number}).id;
 const valueBefore=new Decimal(m.stock_quantity).times(cost),valueAfter=new Decimal(quantity).times(newCost);
 const result={material_id:id,material_name:m.name,from_unit:m.unit,to_unit:target,from_unit_id:unitId(m.unit),to_unit_id:unitId(target),factor:factor.toString(),custom_factor:custom,current_quantity:m.stock_quantity,converted_quantity:quantity,current_cost:cost.toString(),converted_cost:newCost.toFixed(),current_value:valueBefore.toFixed(2),converted_value:valueAfter.toFixed(2),rounding_difference:valueAfter.minus(valueBefore).toFixed(12),reorder_threshold:converted(m.reorder_threshold,factor),preferred_reorder_quantity:m.purchase_unit?m.preferred_reorder_quantity:converted(m.preferred_reorder_quantity,factor),recipe_count:recipes.length,active_batch_count:active.length,unit_version:(m.unit_version??0)+1};
 const token=createHash('sha256').update(JSON.stringify({m,recipeRows,active,suppliers,lastLedger,result})).digest('hex');
 return {preview:{...result,token},material:m,recipes,active,edges:allEdges};
}
export function commitUnitChange(db:Database.Database,p:{material_id:number;new_unit:string;custom_factor?:string;token:string;request_key:string},userId:string){return db.transaction(()=>{
 const previous=db.prepare('SELECT * FROM material_unit_changes WHERE request_key=?').get(p.request_key) as Row|undefined;
 if(previous){if(previous.user_id!==userId||previous.request!==JSON.stringify(p))throw Error('Unit-change request key has already been used.');return JSON.parse(previous.details);}
 const plan=previewUnitChange(db,p.material_id,p.new_unit,p.custom_factor),r=plan.preview,m=plan.material;
 if(r.token!==p.token)throw Error('Inventory, cost, recipes or manufacturing changed after this preview. Review the conversion again.');
 db.prepare('UPDATE materials SET unit=?,unit_id=?,unit_version=?,stock_quantity=?,cost_per_unit=?,reorder_threshold=?,preferred_reorder_quantity=?,quantity_unit=CASE WHEN quantity_unit=\'\' THEN ? ELSE quantity_unit END,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(r.to_unit,r.to_unit_id,r.unit_version,r.converted_quantity,Number(r.converted_cost),r.reorder_threshold,r.preferred_reorder_quantity,r.from_unit,m.id);
 db.prepare('UPDATE materials SET cost_per_unit_exact=?,cost_per_unit_micros=? WHERE id=?').run(r.converted_cost,unitCostMicros(r.converted_cost),m.id);
 for(const link of db.prepare("SELECT supplier_uuid,preferred_reorder_quantity FROM material_suppliers WHERE material_id=? AND purchase_unit=''").all(m.id) as {supplier_uuid:string;preferred_reorder_quantity:number}[])db.prepare('UPDATE material_suppliers SET preferred_reorder_quantity=? WHERE material_id=? AND supplier_uuid=?').run(converted(link.preferred_reorder_quantity,new Decimal(r.factor)),m.id,link.supplier_uuid);
 db.prepare("UPDATE material_suppliers SET quantity_unit=? WHERE material_id=? AND quantity_unit=''").run(r.from_unit,m.id);
 db.prepare('INSERT OR REPLACE INTO material_unit_conversions(material_id,from_unit,to_unit,factor) VALUES (?,?,?,?)').run(m.id,r.from_unit_id,r.to_unit_id,r.factor);
 for(const row of plan.recipes)db.prepare('UPDATE recipe_items SET quantity=?,unit=?,material_id=? WHERE id=?').run(row.quantity,row.unit,m.id,row.id);
 for(const batch of plan.active)db.prepare('UPDATE manufacturing_batches SET recipe_snapshot=? WHERE id=?').run(batch.after,batch.id);
 const change=db.prepare('INSERT INTO material_unit_changes(material_id,user_id,request_key,request,details) VALUES (?,?,?,?,?)').run(m.id,userId,p.request_key,JSON.stringify(p),JSON.stringify({...r,recipes:plan.recipes,batches:plan.active}));
 const ledger=db.prepare("INSERT INTO inventory_ledger(material_id,location,delta,balance,kind,reason,reference_type,reference_id,request_key,unit_cost,recorded_unit) VALUES (?,?,0,?,'Unit change',?,'unit-change',?,?,?,?)").run(m.id,m.location,r.converted_quantity,`Tracking unit ${r.from_unit} -> ${r.to_unit}; factor ${r.factor}; rounding value difference ${r.rounding_difference}`,change.lastInsertRowid,p.request_key,Number(r.converted_cost),r.to_unit);
 db.prepare("INSERT INTO inventory_snapshots(item_type,item_id,location,quantity,unit_cost,ledger_id,recorded_at,recorded_unit) VALUES ('material',?,?,?,?,?,CURRENT_TIMESTAMP,?)").run(m.id,m.location,r.converted_quantity,Number(r.converted_cost),ledger.lastInsertRowid,r.to_unit);
 return r;
 }).immediate();}
