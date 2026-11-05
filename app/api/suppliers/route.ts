import {featureApi} from '@/lib/featureApi';
import {db} from '@/lib/db';
import {supplier,saveSupplier} from '@/lib/supplierStore';
export async function GET(request:Request){const params=new URL(request.url).searchParams;return featureApi(params.has('lookup')?'materials':'vendors','view',async()=>{
 if(params.has('uuid'))return Response.json({supplier:supplier(params.get('uuid')!)});
 if(params.has('code')){const row=db.prepare('SELECT uuid FROM suppliers WHERE organization_id=1 AND supplier_code=? COLLATE NOCASE').get(params.get('code')!.trim()) as {uuid:string}|undefined;if(!row)return Response.json({error:'Supplier not found. Please select an existing supplier or create a new one.'},{status:404});return Response.json({supplier:supplier(row.uuid)});}
 const q='%'+(params.get('q')??'').slice(0,200)+'%';const rows=db.prepare('SELECT uuid FROM suppliers WHERE organization_id=1 AND (company_name LIKE ? OR supplier_code LIKE ?) ORDER BY company_name LIMIT 200').all(q,q) as {uuid:string}[];
 return Response.json({suppliers:rows.map(row=>supplier(row.uuid))});
 })(request);}
export const POST=featureApi('vendors','create',async request=>{const row=saveSupplier(await request.json());return Response.json({ok:true,id:row.id,supplier:row});});
export const PATCH=featureApi('vendors','edit',async request=>{const p=await request.json();if(typeof p.uuid!=='string')throw Error('Choose a supplier.');return Response.json({ok:true,supplier:saveSupplier(p,p.uuid)});});
