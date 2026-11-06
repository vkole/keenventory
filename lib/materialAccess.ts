import {can,type Viewer} from './permissions';
// Supplier purchase prices are material costs, independent of product retail-pricing permissions.
export function materialForViewer(record:Record<string,any>,user:Viewer){
 if(can(user,'materialCosts'))return record;
 const result={...record};delete result.cost_per_unit;delete result.cost_per_unit_micros;delete result.cost_per_unit_exact;delete result.purchase_price;
 if(Array.isArray(result.supplier_links))result.supplier_links=result.supplier_links.map((link:Record<string,unknown>)=>{const visible={...link};delete visible.purchase_price;return visible;});
 return result;
}
