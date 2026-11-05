import Decimal from 'decimal.js';
import {z} from 'zod';
// One micro-dollar per tracking unit; change this constant to configure input precision.
export const UNIT_COST_PRECISION = 6;
export const MAX_UNIT_COST = '999999999.999999';
export function decimalDraft(value:string, precision=UNIT_COST_PRECISION) {
 return new RegExp(`^\\d*(?:\\.\\d{0,${precision}})?$`).test(value);
}
export function parseUnitCost(value:unknown) {
 if(typeof value!=='string' && typeof value!=='number') throw Error('Enter a valid unit cost.');
 const raw=String(value).trim();
 if(!raw || raw==='.' || !decimalDraft(raw)) throw Error(`Enter a nonnegative unit cost with up to ${UNIT_COST_PRECISION} decimal places.`);
 const cost=new Decimal(raw);
 if(!cost.isFinite() || cost.lt(0) || cost.gt(MAX_UNIT_COST)) throw Error(`Unit cost must be between 0 and ${MAX_UNIT_COST}.`);
 return cost;
}
export const unitCostSchema=z.union([z.string(),z.number()]).transform((value,ctx)=>{
 try{return parseUnitCost(value).toNumber();}catch(e){ctx.addIssue({code:'custom',message:e instanceof Error?e.message:'Invalid unit cost.'});return z.NEVER;}
});
export function unitCostMicros(value:unknown){return parseUnitCost(value).times(1_000_000).toNumber();}
export function formatUnitCost(value:Decimal.Value){return '$'+new Decimal(value||0).toFixed(UNIT_COST_PRECISION).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');}
