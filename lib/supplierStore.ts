import {randomUUID} from 'node:crypto';
import {db} from './db';
import {generateSupplierCode,supplierInput,type SupplierRecord} from './supplierValidation';
import {safeSupplierURL} from './materialValidation';
export function supplier(uuid:string):SupplierRecord{
 const row=db.prepare('SELECT * FROM suppliers WHERE uuid=? AND organization_id=1').get(uuid) as SupplierRecord|undefined;
 if(!row)throw Error('Supplier not found. Please select an existing supplier or create a new one.');
 // Legacy websites without a scheme are presented as safe HTTPS links without changing old records.
 let website='';try{website=safeSupplierURL(row.website&&!row.website.includes('://')?'https://'+row.website:row.website||'');}catch{}
 return {...row,website};
}
export function saveSupplier(input:unknown,uuid?:string){const p=supplierInput.parse(input);return db.transaction(()=>{
 const old=uuid?supplier(uuid):null;
 let code=old&&p.code_mode!=='manual'?old.supplier_code:p.supplier_code;
 if(!old&&(p.code_mode==='auto'||!code)){const base=generateSupplierCode(p.company_name);if(!base)throw Error('Enter a supplier name containing letters or numbers, or enter a Supplier ID manually.');code=base;let i=2;while(db.prepare('SELECT id FROM suppliers WHERE organization_id=1 AND supplier_code=? COLLATE NOCASE').get(code))code=base+'-'+String(i++).padStart(3,'0');}
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(code))throw Error('Use 1-128 letters, numbers, hyphens, underscores or periods for the Supplier ID.');
 if(db.prepare('SELECT uuid FROM suppliers WHERE organization_id=1 AND supplier_code=? COLLATE NOCASE AND uuid<>?').get(code,uuid??''))throw Error('Supplier ID is already in use. Choose a unique ID or regenerate it.');
 const {supplier_code:_code,code_mode:_mode,...fields}=p;const keys=Object.keys(fields);
 if(old)db.prepare(`UPDATE suppliers SET ${keys.map(k=>`${k}=?`).join(',')},supplier_code=? WHERE uuid=? AND organization_id=1`).run(...Object.values(fields),code,uuid);
 else{uuid=randomUUID();db.prepare(`INSERT INTO suppliers(${keys.join(',')},supplier_code,uuid) VALUES (${keys.map(()=>'?').join(',')},?,?)`).run(...Object.values(fields),code,uuid);}
 return supplier(uuid!);
 }).immediate();}
