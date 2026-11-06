import type Database from 'better-sqlite3';
import {conversionFactor} from './materialUnits';
import {materialUnitEdges} from './unitConversionStore';
import Decimal from 'decimal.js';
export function normalizeMaterialHistory(db:Database.Database,rows:Record<string,any>[],materials:Record<string,any>[],keys:string[]){return rows.map(row=>{
 const id=row.material_id??(row.item_type==='material'?row.item_id:null),material=materials.find(m=>m.id===id);if(!material||!row.recorded_unit||row.recorded_unit===material.unit)return row;
 const factor=conversionFactor(row.recorded_unit,material.unit,materialUnitEdges(db,id)),next:Record<string,any>={...row,original_recorded_unit:row.recorded_unit,normalized_unit:material.unit};
 for(const key of keys)if(next[key]!=null)next[key]=new Decimal(next[key]).times(factor).toNumber();
 if(next.unit_cost!=null)next.unit_cost=new Decimal(next.unit_cost).div(factor).toNumber();return next;
 });}
