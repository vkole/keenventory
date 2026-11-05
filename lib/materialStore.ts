import {db} from './db';
import {unitCostMicros} from './unitCosts';
import Decimal from 'decimal.js';
import {inventory} from './manufacturing';
import {materialInput,stockStatus} from './materialValidation';
export function material(id:number): Record<string,any> {
 const m=db.prepare('SELECT * FROM materials WHERE id=?').get(id) as Record<string,any>|undefined;
 if(!m) throw Error('Material not found.');
 const reserved=inventory(db).find(s=>s.id===id)?.reserved_quantity??0;
 const available=Number((m.stock_quantity-reserved).toFixed(6));
 if(m.cost_per_unit_micros!==null)m.cost_per_unit=new Decimal(m.cost_per_unit_micros).div(1_000_000).toNumber();
 return {...m,reserved_quantity:reserved,available_quantity:available,stock_status:stockStatus(available,m.reorder_threshold),barcodes:(db.prepare('SELECT * FROM material_barcodes WHERE material_id=? ORDER BY id').all(id) as Record<string,unknown>[]).map(b=>({...b,active:!!b.active})),images:db.prepare('SELECT id,is_primary,created_at FROM material_images WHERE material_id=? ORDER BY is_primary DESC,id').all(id)};
}
export function saveMaterial(input:unknown,id?:number) {
 const p=materialInput.parse(input);
 return db.transaction(()=>{
  const existing=id?material(id):null;
  if(existing && (existing.unit!==p.unit || existing.location!==p.location) && (existing.stock_quantity!==0 || db.prepare('SELECT id FROM inventory_ledger WHERE material_id=? LIMIT 1').get(id))) throw Error('Tracking unit and location cannot change after stock history exists.');
  if(p.supplier_id && !db.prepare('SELECT id FROM suppliers WHERE id=?').get(p.supplier_id)) throw Error('Supplier not found.');
  const {barcodes,stock_quantity,...fields}=p;
  const keys=Object.keys(fields);
  if(id) db.prepare(`UPDATE materials SET ${keys.map(k=>`${k}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...Object.values(fields),id);
  else {
   id=Number(db.prepare(`INSERT INTO materials (${keys.join(',')},stock_quantity) VALUES (${keys.map(()=>'?').join(',')},?)`).run(...Object.values(fields),stock_quantity).lastInsertRowid);
   if(stock_quantity>0) db.prepare("INSERT INTO inventory_ledger(material_id,location,delta,balance,kind,reason,reference_type,reference_id,unit_cost) VALUES (?,?,?,?,'Opening','Initial material setup','material',?,?)").run(id,p.location,stock_quantity,stock_quantity,id,p.cost_per_unit);
  }
  const values=new Set<string>();
  for(const b of barcodes){
   if(values.has(b.value)) throw Error('Each barcode may appear only once.'); values.add(b.value);
   const duplicate=db.prepare('SELECT m.name FROM material_barcodes b JOIN materials m ON m.id=b.material_id WHERE b.value=? AND b.material_id<>?').get(b.value,id) as {name:string}|undefined;
   if(duplicate) throw Error(`Barcode ${b.value} is already assigned to ${duplicate.name}.`);
  }
  db.prepare('UPDATE materials SET cost_per_unit_micros=? WHERE id=?').run(unitCostMicros(p.cost_per_unit),id);
  const retained:number[]=[];
  for(const b of barcodes){
   const old=db.prepare('SELECT id FROM material_barcodes WHERE material_id=? AND value=?').get(id,b.value) as {id:number}|undefined;
   if(b.value.startsWith('KEENVENTORY:')){
    const generated=db.prepare('SELECT material_id FROM generated_inventory_codes WHERE value=?').get(b.value) as {material_id:number}|undefined;
    if(!generated || generated.material_id!==id || b.type!=='QR_CODE')throw Error('This inventory QR identifier is not registered to this material.');
   }
   if(old){db.prepare('UPDATE material_barcodes SET type=?,package_quantity=?,package_unit=?,active=? WHERE id=?').run(b.type,b.package_quantity,b.package_unit,b.active?1:0,old.id);retained.push(old.id);}
   else {const row=db.prepare('INSERT INTO material_barcodes(material_id,value,type,package_quantity,package_unit,active) VALUES (?,?,?,?,?,?)').run(id,b.value,b.type,b.package_quantity,b.package_unit,b.active?1:0);retained.push(Number(row.lastInsertRowid));}
  }
  // Removing a registered code deactivates it, preserving its identity and scan history.
  const oldCodes=db.prepare('SELECT id FROM material_barcodes WHERE material_id=?').all(id) as {id:number}[];
  for(const old of oldCodes)if(!retained.includes(old.id))db.prepare('UPDATE material_barcodes SET active=0 WHERE id=?').run(old.id);
  return id!;
 }).immediate();
}
