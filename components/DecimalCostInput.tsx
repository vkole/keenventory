'use client';
import {decimalDraft,UNIT_COST_PRECISION} from '@/lib/unitCosts';
import {inputClass} from './ProductForm';
export function DecimalCostInput({label,value,onChange,precision=UNIT_COST_PRECISION,className=inputClass}:{label:string;value:string;onChange:(value:string)=>void;precision?:number;className?:string}){
 return <label className="grid gap-1 text-sm">{label}<input aria-label={label} required type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]*)?|[.][0-9]+" title="Enter a nonnegative decimal amount." autoComplete="off" className={className} value={value} placeholder="0.000000" onChange={e=>{if(decimalDraft(e.target.value,precision))onChange(e.target.value);}}/></label>;
}
