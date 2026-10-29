import { TestRequest as Request, setupTestOwner } from './authTestSupport';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import sharp from 'sharp';
import { product,saveProduct } from './productStore';
test('image objects persist through the S3 API, preserve shared copies, and validate uploads',async()=>{
 const objects=new Map<string,Buffer>();const server=createServer(async(req,res)=>{const key=new URL(req.url!,'http://localhost').pathname;if(req.method==='PUT'){const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));objects.set(key,Buffer.concat(chunks));res.writeHead(200);res.end();}else if(req.method==='GET'){const data=objects.get(key);res.writeHead(data?200:404,{'Content-Type':'image/webp'});res.end(data);}else if(req.method==='DELETE'){objects.delete(key);res.writeHead(204);res.end();}else{res.writeHead(405);res.end();}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number};
 const folder=mkdtempSync(path.join(tmpdir(),'keenventory-images-'));process.env.KEENVENTORY_DATA_DIR=folder;Object.assign(process.env,{S3_ENDPOINT:`http://127.0.0.1:${address.port}`,S3_BUCKET:'test',S3_ACCESS_KEY_ID:'test',S3_SECRET_ACCESS_KEY:'test',S3_REGION:'us-east-1',S3_FORCE_PATH_STYLE:'true'});const {db}=await import('./db');await setupTestOwner();
 try{const route=await import('../app/api/products/images/route');const actions=await import('../app/api/products/actions/route');const id=saveProduct(db,{name:'Photo Candle',sku:'PHOTO'});
 const upload=async(type:string,bytes:Buffer)=>{const form=new FormData();form.set('product_id',String(id));form.set('file',new File([new Uint8Array(bytes)],'image.'+type.split('/')[1],{type}));return route.POST(new Request('http://localhost/api/products/images',{method:'POST',body:form}));};
 const png=await sharp({create:{width:16,height:16,channels:3,background:'#000e2d'}}).png().toBuffer();assert.equal((await upload('image/png',png)).status,200);const first=product(db,id).images![0];assert.equal(objects.size,1);assert.equal(first.is_primary,1);
 const read=await route.GET(new Request(`http://localhost/api/products/images?id=${first.id}`));assert.equal(read.status,200);assert.equal((await sharp(Buffer.from(await read.arrayBuffer())).metadata()).format,'webp');
 const copyResponse=await actions.POST(new Request('http://localhost/api/products/actions',{method:'POST',body:JSON.stringify({id,action:'copy',name:'Copied Photo',sku:'PHOTO-COPY',copy_images:true})}));const copy=await copyResponse.json();assert.equal(product(db,copy.id).images![0].id,first.id);
 const remove=(pid:number,imageId:number)=>route.DELETE(new Request('http://localhost/api/products/images',{method:'DELETE',body:JSON.stringify({product_id:pid,image_id:imageId,confirm:true})}));
 assert.equal((await remove(id,first.id)).status,200);assert.equal(objects.size,1);assert.equal(product(db,id).images!.length,0);assert.equal((await route.GET(new Request(`http://localhost/api/products/images?id=${first.id}`))).status,200);
 assert.equal((await remove(copy.id,first.id)).status,200);assert.equal(objects.size,0);
 assert.equal((await upload('image/jpeg',await sharp(png).jpeg().toBuffer())).status,200);assert.equal((await upload('image/webp',await sharp(png).webp().toBuffer())).status,200);const images=product(db,id).images!;assert.equal((await route.PATCH(new Request('http://localhost/api/products/images',{method:'PATCH',body:JSON.stringify({product_id:id,image_id:images[1].id})}))).status,200);assert.equal(product(db,id).image_id,images[1].id);
 assert.equal((await upload('image/png',Buffer.from('not an image'))).status,400);assert.equal((await upload('image/svg+xml',Buffer.from('<svg/>'))).status,400);

 const media=await import('../app/api/attachments/route');const recipes=await import('../app/api/recipes/route');const recipe=(await (await recipes.GET(new Request('http://localhost/api/recipes'))).json()).recipes[0];
 const form=new FormData();form.set('owner_type','recipe');form.set('owner_id',String(recipe.id));form.set('file',new File([new Uint8Array(png)],'recipe.png',{type:'image/png'}));const uploaded=await media.POST(new Request('http://localhost/api/attachments',{method:'POST',body:form}));assert.equal(uploaded.status,200);const photo=await uploaded.json();
 assert.equal((await media.GET(new Request('http://localhost/api/attachments?id='+photo.id))).status,200);
 const duplicated=await recipes.POST(new Request('http://localhost/api/recipes',{method:'POST',body:JSON.stringify({product_id:recipe.product_id,version:recipe.version,batch_yield:recipe.batch_yield,batch_minutes:recipe.batch_minutes,hourly_labor_rate:recipe.hourly_labor_rate,status:recipe.status,ingredients:recipe.ingredients,copy_from:recipe.id,name:'Recipe with shared image copy'})}));const duplicateRecipe=await duplicated.json();assert.equal(duplicated.status,200,JSON.stringify(duplicateRecipe));const copiedPhoto=db.prepare("SELECT id FROM attachments WHERE owner_type='recipe' AND owner_id=?").get(duplicateRecipe.id) as {id:number};assert.ok(copiedPhoto);
 const count=objects.size;const deleteMedia=(owner:number,photo:number)=>media.DELETE(new Request('http://localhost/api/attachments',{method:'DELETE',body:JSON.stringify({owner_type:'recipe',owner_id:owner,id:photo,confirm:true})}));assert.equal((await deleteMedia(recipe.id,photo.id)).status,200);assert.equal(objects.size,count);assert.equal((await media.GET(new Request('http://localhost/api/attachments?id='+copiedPhoto.id))).status,200);assert.equal((await deleteMedia(duplicateRecipe.id,copiedPhoto.id)).status,200);assert.equal(objects.size,count-1);
 }finally{db.close();for(const name of ['KEENVENTORY_DATA_DIR','S3_ENDPOINT','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','S3_REGION','S3_FORCE_PATH_STYLE'])delete process.env[name];await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(folder,{recursive:true,force:true});}
});
