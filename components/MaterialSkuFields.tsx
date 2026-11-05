'use client';
import {useState} from 'react';
import {generateMaterialSku,MATERIAL_SKU_MAX_LENGTH,type MaterialSkuMode} from '@/lib/materialSku';
import {inputClass} from './ProductForm';
export function MaterialSkuFields({name,sku,mode,existing=false,onChange,onModeChange,nameLabel='Material Name'}:{name:string;sku:string;mode:MaterialSkuMode;existing?:boolean;onChange:(value:{name:string;sku:string})=>void;onModeChange:(mode:MaterialSkuMode)=>void;nameLabel?:string}){
 const [editable,setEditable]=useState(false);
 return <div className="space-y-3 sm:col-span-2">
  <label className="grid gap-1 text-sm">{nameLabel}<input required className={inputClass} value={name} onChange={e=>{onChange({name:e.target.value,sku:!existing&&mode==='auto'?generateMaterialSku(e.target.value):sku});if(existing&&mode==='regenerate')onModeChange('manual');}}/></label>
  <label className="grid gap-1 text-sm">SKU<input required className={inputClass} value={sku} readOnly={!editable} maxLength={MATERIAL_SKU_MAX_LENGTH} onChange={e=>onChange({name,sku:e.target.value})}/></label>
  <div className="flex flex-wrap gap-3 text-sm"><button type="button" className="underline" onClick={()=>{setEditable(true);onModeChange('manual');}}>Edit SKU Manually</button><button type="button" className="underline" disabled={!generateMaterialSku(name)} onClick={()=>{onChange({name,sku:generateMaterialSku(name)});onModeChange(existing?'regenerate':'auto');setEditable(false);}}>Regenerate SKU</button></div>
  <p className="text-xs text-slate-600">{existing?'The current SKU is preserved when the material name changes.':mode==='auto'?'Generated from the material name. A duplicate receives the next available suffix when saved.':'Manual SKU: changes to the material name will not replace it.'}</p>
  {existing&&<p className="text-sm text-amber-800">Changing an existing SKU may affect external integrations, printed barcode labels, or imported spreadsheets. Barcode and QR code associations remain linked to this material.</p>}
 </div>;
}
