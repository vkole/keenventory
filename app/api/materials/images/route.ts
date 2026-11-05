import {featureApi} from '@/lib/featureApi';
import {db} from '@/lib/db';
import {material} from '@/lib/materialStore';
import {storeImage,readImage,deleteImage} from '@/lib/imageStorage';
export const GET=featureApi('materials','view',async(req)=>{
 const row=db.prepare('SELECT object_key FROM material_images WHERE id=?').get(Number(new URL(req.url).searchParams.get('id'))) as {object_key:string}|undefined;
 if(!row)return new Response('Image not found',{status:404});
 return new Response(await readImage(row.object_key),{headers:{'Content-Type':'image/webp','X-Content-Type-Options':'nosniff'}});
});
export const POST=featureApi('materials','edit',async(req)=>{
 const data=await req.formData();const id=Number(data.get('material_id'));material(id);
 if((db.prepare('SELECT COUNT(*) n FROM material_images WHERE material_id=?').get(id) as {n:number}).n>=12)throw Error('Maximum 12 images per material.');
 const file=data.get('file');if(!(file instanceof File))throw Error('Choose an image.');
 const key=await storeImage(file);
 try {db.transaction(()=>{const has=db.prepare('SELECT id FROM material_images WHERE material_id=?').get(id);db.prepare('INSERT INTO material_images(material_id,object_key,is_primary) VALUES (?,?,?)').run(id,key,has?0:1);}).immediate();}
 catch(e){await deleteImage(key).catch(()=>{});throw e;}
 return Response.json({ok:true});
});
export const PATCH=featureApi('materials','edit',async(req)=>{
 const p=await req.json();db.transaction(()=>{
 if(!db.prepare('SELECT id FROM material_images WHERE id=? AND material_id=?').get(p.image_id,p.material_id))throw Error('Image not found.');
 db.prepare('UPDATE material_images SET is_primary=0 WHERE material_id=?').run(p.material_id);db.prepare('UPDATE material_images SET is_primary=1 WHERE id=?').run(p.image_id);
 }).immediate();return Response.json({ok:true});
});
export const DELETE=featureApi('materials','edit',async(req)=>{
 const p=await req.json();if(p.confirm!==true)throw Error('Confirm removal.');
 const image=db.prepare('SELECT object_key FROM material_images WHERE id=? AND material_id=?').get(p.image_id,p.material_id) as {object_key:string}|undefined;if(!image)throw Error('Image not found.');
 db.transaction(()=>{db.prepare('DELETE FROM material_images WHERE id=?').run(p.image_id);if(!db.prepare('SELECT id FROM material_images WHERE material_id=? AND is_primary=1').get(p.material_id))db.prepare('UPDATE material_images SET is_primary=1 WHERE id=(SELECT MIN(id) FROM material_images WHERE material_id=?)').run(p.material_id);}).immediate();
 await deleteImage(image.object_key);return Response.json({ok:true});
});
