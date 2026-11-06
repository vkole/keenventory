import type Database from 'better-sqlite3';
import {type UnitConversion} from './materialUnits';
export function materialUnitEdges(db:Database.Database,id:number):UnitConversion[]{return db.prepare('SELECT from_unit,to_unit,factor FROM material_unit_conversions WHERE material_id=? ORDER BY created_at').all(id) as UnitConversion[];}
