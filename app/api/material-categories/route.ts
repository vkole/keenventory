import {featureApi} from '@/lib/featureApi';
import {can} from '@/lib/permissions';
import {requirePermission} from '@/lib/access';
import {db} from '@/lib/db';
import {categoryInput,categoryKey} from '@/lib/materialCategories';
import {getCategory,registerCategory} from '@/lib/categoryStore';
import {z} from 'zod';
export const GET=featureApi('materials','view',async request=>{const p=new URL(request.url).searchParams,q='%'+(p.get('q')??'').slice(0,200)+'%';return Response.json({categories:db.prepare(`SELECT c.*,(SELECT COUNT(*) FROM materials m WHERE m.category_id=c.id) material_count FROM material_categories c WHERE c.organization_id=1 AND (?=1 OR c.archived=0 OR c.id=?) AND c.name LIKE ? ORDER BY c.name COLLATE NOCASE`).all(p.get('archived')==='1'?1:0,Number(p.get('include_id'))||0,q)});});
export const POST=featureApi('materials','view',async(request,user)=>{if(!can(user,'materials','create'))requirePermission(user,'materials','edit');const category=registerCategory(db,await request.json());return Response.json({ok:true,category});});
export const PATCH=featureApi('materials','edit',async request=>{
 const p=z.object({id:z.number().int().positive(),action:z.enum(['update','archive','restore','reassign']),name:z.string().optional(),description:z.string().optional(),target_id:z.number().int().positive().optional()}).parse(await request.json());
 db.transaction(()=>{const category=getCategory(db,p.id);
 if(p.action==='update'){const input=categoryInput.parse({name:p.name??category.name,description:p.description??category.description});const key=categoryKey(input.name);if(db.prepare('SELECT id FROM material_categories WHERE organization_id=1 AND name_key=? AND id<>?').get(key,p.id))throw Error('A category with this name already exists in your organization.');db.prepare('UPDATE material_categories SET name=?,name_key=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(input.name,key,input.description,p.id);}
 else if(p.action==='reassign'){if(!p.target_id||p.target_id===p.id)throw Error('Choose a different active category.');const target=getCategory(db,p.target_id);if(target.archived)throw Error('Choose an active category.');db.prepare('UPDATE materials SET category_id=?,category=? WHERE category_id=? AND organization_id=1').run(target.id,target.name,p.id);}
 else db.prepare('UPDATE material_categories SET archived=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(p.action==='archive'?1:0,p.id);
 }).immediate();return Response.json({ok:true,category:getCategory(db,p.id)});
});
export const DELETE=featureApi('materials','delete',async request=>{
 const p=z.object({id:z.number().int().positive(),confirm:z.literal(true)}).parse(await request.json());db.transaction(()=>{getCategory(db,p.id);if(db.prepare('SELECT id FROM materials WHERE category_id=? LIMIT 1').get(p.id))throw Error('Reassign all materials before deleting this category.');db.prepare('DELETE FROM material_categories WHERE id=? AND organization_id=1').run(p.id);}).immediate();return Response.json({ok:true});
});
