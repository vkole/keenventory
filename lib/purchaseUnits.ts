import Decimal from 'decimal.js';
export const purchaseUnits=['Each','Bottle','Bag','Box','Pack','Case','Jar','Roll','Pallet','Other'] as const;
export const quantityUnits=['oz','lb','g','kg','mg','ml','l','fl oz','item'] as const;
const aliases:Record<string,string>={ounces:'oz',ounce:'oz',pounds:'lb',pound:'lb',lbs:'lb',grams:'g',gram:'g',kilograms:'kg',milliliters:'ml',liters:'l',litres:'l',each:'item',items:'item',unit:'item',units:'item',ea:'item','fluid ounce':'fl oz','fluid ounces':'fl oz'};
const measures:Record<string,[string,string]>={oz:['mass','28.349523125'],lb:['mass','453.59237'],g:['mass','1'],kg:['mass','1000'],mg:['mass','0.001'],ml:['volume','1'],l:['volume','1000'],'fl oz':['volume','29.5735295625'],item:['count','1']};
export function convertPurchaseQuantity(quantity:Decimal.Value,from:string,to:string){
 const norm=(s:string)=>{const v=s.trim().toLowerCase();return aliases[v]??v;};const source=norm(from),target=norm(to);
 const n=new Decimal(quantity);if(!n.isFinite()||n.lte(0)||!source||!target)throw Error('Enter a positive quantity and both measurement units.');
 if(source===target)return n;
 const a=measures[source],b=measures[target];if(!a||!b||a[0]!==b[0])throw Error('These units are incompatible. Mass and volume cannot be converted without material-specific density.');
 return n.times(a[1]).div(b[1]);
}
export function purchaseUnitCost(quantity:Decimal.Value,quantityUnit:string,trackingUnit:string,price:Decimal.Value){
 const converted=convertPurchaseQuantity(quantity,quantityUnit,trackingUnit),cost=new Decimal(price);
 if(!cost.isFinite()||cost.lt(0))throw Error('Enter a nonnegative purchase price.');
 return {tracking_quantity:converted.toDecimalPlaces(6).toNumber(),cost_per_unit:cost.div(converted).toDecimalPlaces(6).toNumber()};
}
