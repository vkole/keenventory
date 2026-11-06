import {featureApi} from '@/lib/featureApi';
import {audit,requirePermission} from '@/lib/access';
import {db} from '@/lib/db';
import {previewUnitChange,commitUnitChange} from '@/lib/unitChangeStore';
import {material} from '@/lib/materialStore';
import {z} from 'zod';
const input=z.object({action:z.enum(['preview','commit']),material_id:z.number().int().positive(),new_unit:z.string().min(1).max(80),custom_factor:z.string().max(80).optional(),token:z.string().optional(),request_key:z.string().uuid().optional(),confirm:z.boolean().optional()});
export const POST=featureApi('materials','edit',async(req,user)=>{
 requirePermission(user,'materialCosts','edit');requirePermission(user,'adjustments','create');const p=input.parse(await req.json());
 if(p.action==='preview'){const plan=previewUnitChange(db,p.material_id,p.new_unit,p.custom_factor);if(plan.recipes.length)requirePermission(user,'recipes','edit');if(plan.active.length)requirePermission(user,'manufacturing','edit');return Response.json({preview:plan.preview});}
 if(p.confirm!==true||!p.token||!p.request_key)throw Error('Review and confirm the unit change first.');
 const changed=db.transaction(()=>{const previous=db.prepare('SELECT id FROM material_unit_changes WHERE request_key=?').get(p.request_key);if(!previous){const plan=previewUnitChange(db,p.material_id,p.new_unit,p.custom_factor);if(plan.recipes.length)requirePermission(user,'recipes','edit');if(plan.active.length)requirePermission(user,'manufacturing','edit');}const changed=commitUnitChange(db,{material_id:p.material_id,new_unit:p.new_unit,custom_factor:p.custom_factor,token:p.token!,request_key:p.request_key!},user.id);if(!previous)audit(user,'Material tracking unit changed',String(p.material_id),true,changed);return changed;}).immediate();
 return Response.json({ok:true,change:changed,material:material(p.material_id)});
});
