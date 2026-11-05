import {z} from 'zod';
export function categoryName(value:string){return value.trim().replace(/\s+/g,' ');}
export function categoryKey(value:string){return categoryName(value).normalize('NFKC').toLowerCase();}
export const categoryInput=z.object({name:z.string().transform(categoryName).pipe(z.string().min(1,'Enter a category name.').max(4000)),description:z.string().trim().max(4000).default('')});
export type MaterialCategory={id:number;organization_id:number;name:string;name_key:string;description:string;archived:number;material_count?:number};
