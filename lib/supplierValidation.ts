import {z} from 'zod';
import {safeSupplierURL} from './materialValidation';
export function generateSupplierCode(name:string){const slug=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9\s-]/g,'').replace(/[\s-]+/g,'-').replace(/^-|-$/g,'');return slug?('SUP-'+slug).slice(0,120).replace(/-$/,''):'';}
const text=z.string().trim().max(4000);
export const supplierInput=z.object({company_name:text.min(1),supplier_code:text.default(''),code_mode:z.enum(['auto','manual']).optional(),contact_name:text.default(''),email:z.union([z.literal(''),z.email()]).default(''),phone:text.default(''),website:text.transform(safeSupplierURL).default(''),address:text.default(''),notes:text.default(''),lead_time:text.default('7 days'),payment_terms:text.default('Net 30')});
export type SupplierInput=z.infer<typeof supplierInput>;
export type SupplierRecord=Omit<SupplierInput,'code_mode'> & {id:number;uuid:string;created_at:string};
