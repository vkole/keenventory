import Decimal from 'decimal.js';
export const purchaseUnits=['Each','Bottle','Bag','Box','Pack','Case','Jar','Roll','Pallet','Other'] as const;
export const quantityUnits=['oz','lb','g','kg','mg','ml','l','fl oz','gal','item','pack','box','bag','bottle','roll'] as const;
import {conversionFactor,type UnitConversion} from './materialUnits';
export function convertPurchaseQuantity(quantity:Decimal.Value,from:string,to:string,edges:UnitConversion[]=[]){const n=new Decimal(quantity);if(!n.isFinite()||n.lte(0))throw Error('Enter a positive quantity.');return n.times(conversionFactor(from,to,edges));}
export function purchaseUnitCost(quantity:Decimal.Value,quantityUnit:string,trackingUnit:string,price:Decimal.Value,edges:UnitConversion[]=[]){
 const converted=convertPurchaseQuantity(quantity,quantityUnit,trackingUnit,edges),cost=new Decimal(price);
 if(!cost.isFinite()||cost.lt(0))throw Error('Enter a nonnegative purchase price.');
 return {tracking_quantity:converted.toDecimalPlaces(6).toNumber(),cost_per_unit:cost.div(converted).toDecimalPlaces(12).toNumber()};
}
