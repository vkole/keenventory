import {db} from './db';
import {getCategory,resolveCategory} from './categoryStore';
import {supplier} from './supplierStore';
import {purchaseUnitCost} from './purchaseUnits';
import {generateMaterialSku,validateMaterialSku} from './materialSku';
import {unitCostMicros} from './unitCosts';
import Decimal from 'decimal.js';
import {inventory} from './manufacturing';
import {materialSaveInput,stockStatus} from './materialValidation';
export function material(id:number): Record<string,any> {
 const m=db.prepare('SELECT * FROM materials WHERE id=?').get(id) as Record<string,any>|undefined;
 if(!m) throw Error('Material not found.');
 if(m.category_id)m.category=getCategory(db,m.category_id).name;
 const links=db.prepare('SELECT * FROM material_suppliers WHERE material_id=? ORDER BY is_primary DESC').all(id) as Record<string,any>[];
 const primary=links.find(link=>link.is_primary);
 if(primary)Object.assign(m,primary,{id:m.id});
 m.supplier_links=links.filter(link=>!link.is_primary);
 if(m.supplier_uuid){const company=supplier(m.supplier_uuid);Object.assign(m,{supplier_id:company.id,supplier_name:company.company_name,supplier_code:company.supplier_code,supplier_website:company.website,supplier_contact_name:company.contact_name,supplier_email:company.email,supplier_phone:company.phone,supplier_address:company.address});}

 const reserved=inventory(db).find(s=>s.id===id)?.reserved_quantity??0;
 const available=Number((m.stock_quantity-reserved).toFixed(6));
 if(m.cost_per_unit_micros!==null)m.cost_per_unit=new Decimal(m.cost_per_unit_micros).div(1_000_000).toNumber();
 return {...m,reserved_quantity:reserved,available_quantity:available,stock_status:stockStatus(available,m.reorder_threshold),barcodes:(db.prepare('SELECT * FROM material_barcodes WHERE material_id=? ORDER BY id').all(id) as Record<string,unknown>[]).map(b=>({...b,active:!!b.active})),images:db.prepare('SELECT id,is_primary,created_at FROM material_images WHERE material_id=? ORDER BY is_primary DESC,id').all(id)};
}
export function saveMaterial(input:unknown,id?:number) {
 const {sku_mode,confirm_sku_change,apply_purchase_cost,...p}=materialSaveInput.parse(input);
 return db.transaction(()=>{
  const existing=id?material(id):null;
  const category=resolveCategory(db,p.category_id,p.category,existing?.category_id);p.category_id=category.id;p.category=category.name;
  // This immediate transaction serializes allocation and insertion across connections.
  // The workspace database enforces organization_id=1 for all inventory records.
  const skuTaken=(sku:string)=>!!db.prepare('SELECT id FROM materials WHERE organization_id=1 AND sku=? COLLATE NOCASE AND id<>? LIMIT 1').get(sku,id??0);
  if((!existing && (sku_mode==='auto'||sku_mode==='regenerate'||(!sku_mode&&!p.sku))) || (existing&&sku_mode==='regenerate')){
   const base=generateMaterialSku(p.name);if(!base)throw Error('Enter a material name containing letters or numbers, or edit the SKU manually.');
   let candidate=base;let sequence=2;
   while(skuTaken(candidate))candidate=base+'-'+String(sequence++).padStart(3,'0');
   p.sku=candidate;
  }else if(existing&&!p.sku&&sku_mode!=='manual'){p.sku=existing.sku;}
  if(!existing||p.sku!==existing.sku){
   p.sku=validateMaterialSku(p.sku);
   if(existing&&p.sku!==existing.sku&&confirm_sku_change!==true)throw Error('Confirm the SKU change. External integrations, printed labels, and imported spreadsheets may be affected.');
   if(skuTaken(p.sku))throw Error('This SKU is already used by another material in your organization. Choose another SKU or regenerate it.');
  }
  if(existing && (existing.unit!==p.unit || existing.location!==p.location) && (existing.stock_quantity!==0 || db.prepare('SELECT id FROM inventory_ledger WHERE material_id=? LIMIT 1').get(id))) throw Error('Tracking unit and location cannot change after stock history exists.');
  if(!p.supplier_uuid&&p.supplier_id){const company=db.prepare('SELECT uuid FROM suppliers WHERE id=? AND organization_id=1').get(p.supplier_id) as {uuid:string}|undefined;if(!company)throw Error('Supplier not found. Please select an existing supplier or create a new one.');p.supplier_uuid=company.uuid;}
  if(p.supplier_uuid){const company=supplier(p.supplier_uuid);p.supplier_id=company.id;p.supplier_name=company.company_name;p.supplier_website=company.website;}
  if(apply_purchase_cost){p.cost_per_unit=purchaseUnitCost(p.purchase_quantity,p.quantity_unit||p.unit,p.unit,p.purchase_price).cost_per_unit;unitCostMicros(p.cost_per_unit);}
  const {barcodes,stock_quantity,supplier_links,...fields}=p;
  const keys=Object.keys(fields);
  if(id) db.prepare(`UPDATE materials SET ${keys.map(k=>`${k}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...Object.values(fields),id);
  else {
   id=Number(db.prepare(`INSERT INTO materials (${keys.join(',')},stock_quantity) VALUES (${keys.map(()=>'?').join(',')},?)`).run(...Object.values(fields),stock_quantity).lastInsertRowid);
   if(stock_quantity>0) db.prepare("INSERT INTO inventory_ledger(material_id,location,delta,balance,kind,reason,reference_type,reference_id,unit_cost) VALUES (?,?,?,?,'Opening','Initial material setup','material',?,?)").run(id,p.location,stock_quantity,stock_quantity,id,p.cost_per_unit);
  }
  const primaryLink=p.supplier_uuid?{supplier_uuid:p.supplier_uuid,supplier_sku:p.supplier_sku,product_url:p.product_url,purchase_unit:p.purchase_unit,purchase_quantity:p.purchase_quantity,quantity_unit:p.quantity_unit||p.unit,purchase_price:p.purchase_price,preferred_reorder_quantity:p.preferred_reorder_quantity,lead_time_days:p.lead_time_days}:null;
  const alternatives=supplier_links??(existing?.supplier_links??[]);
  const allLinks=[...(primaryLink?[primaryLink]:[]),...alternatives];const uniqueSuppliers=new Set<string>();
  for(const link of allLinks){supplier(link.supplier_uuid);if(uniqueSuppliers.has(link.supplier_uuid))throw Error('Select each supplier only once per material.');uniqueSuppliers.add(link.supplier_uuid);}
  db.prepare('DELETE FROM material_suppliers WHERE material_id=?').run(id);
  for(const link of allLinks){db.prepare('INSERT INTO material_suppliers(material_id,supplier_uuid,supplier_sku,product_url,purchase_unit,purchase_quantity,quantity_unit,purchase_price,preferred_reorder_quantity,lead_time_days,is_primary) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,link.supplier_uuid,link.supplier_sku,link.product_url,link.purchase_unit,link.purchase_quantity,link.quantity_unit,link.purchase_price,link.preferred_reorder_quantity,link.lead_time_days,link.supplier_uuid===p.supplier_uuid?1:0);}
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
