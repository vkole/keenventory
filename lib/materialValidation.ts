import {z} from 'zod';
import {unitCostSchema} from './unitCosts';
export const barcodeTypes = ['UPC_A','UPC_E','EAN_13','EAN_8','CODE_128','CODE_39','QR_CODE','ITF','DATA_MATRIX'] as const;
export function safeSupplierURL(value:string) {
  if (!value) return '';
  const url=new URL(value);
  if(url.protocol!=='https:' || url.username || url.password || !url.hostname.includes('.') || /^(localhost|.*\.local)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) throw Error('Use a public HTTPS supplier URL without credentials.');
  return url.href;
}
const text=z.string().trim().max(4000);
const amount=z.coerce.number().finite().nonnegative();
export const materialSupplierLink=z.object({supplier_uuid:z.string().uuid(),supplier_sku:text.default(''),product_url:text.transform(safeSupplierURL).default(''),purchase_unit:text.default(''),purchase_quantity:amount.default(1),quantity_unit:text.default(''),purchase_price:unitCostSchema.default(0),preferred_reorder_quantity:amount.default(0),lead_time_days:amount.int().default(0)});
export type MaterialSupplierLink=z.infer<typeof materialSupplierLink>;
export const materialInput=z.object({
  name:text.min(1),sku:z.string().max(4000).default(''),category_id:z.number().int().positive().nullable().optional(),category:text.default('Miscellaneous Materials'),unit:text.min(1).default('oz'),
  stock_quantity:amount.default(0),cost_per_unit:unitCostSchema.default(0),reorder_threshold:amount.default(0),location:text.min(1).default('Main Storage'),
  description:text.default(''),supplier_uuid:z.string().uuid().nullable().default(null),quantity_unit:text.default(''),supplier_links:z.array(materialSupplierLink).max(30).optional(),supplier_id:z.number().int().positive().nullable().default(null),supplier_name:text.default(''),supplier_website:text.transform(safeSupplierURL).default(''),product_url:text.transform(safeSupplierURL).default(''),supplier_sku:text.default(''),purchase_unit:text.default(''),purchase_quantity:amount.default(1),purchase_price:unitCostSchema.default(0),preferred_reorder_quantity:amount.default(0),lead_time_days:amount.int().default(0),notes:text.default(''),
  barcodes:z.array(z.object({id:z.number().int().positive().optional(),active:z.boolean().default(true),value:z.string().trim().min(1).max(2048).regex(/^[\x20-\x7e]+$/),type:z.enum(barcodeTypes),package_quantity:z.coerce.number().finite().positive(),package_unit:text.min(1)})).max(50).default([]),
});
export const materialSaveInput=materialInput.extend({sku_mode:z.enum(['auto','manual','regenerate']).optional(),confirm_sku_change:z.boolean().optional(),apply_purchase_cost:z.boolean().optional()});
export type MaterialInput=z.infer<typeof materialInput>;
export function stockStatus(quantity:number,threshold:number) {return quantity<=0?'Out of Stock':quantity<=threshold?'Low Stock':'In Stock';}
