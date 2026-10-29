import { secured } from '@/lib/access';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { product, event } from '@/lib/productStore';
import {
  storeImage,
  readImage,
  deleteImage,
  imageStorageReady,
} from '@/lib/imageStorage';
export const dynamic = 'force-dynamic';
async function handleGET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.has('status'))
    return NextResponse.json({ configured: imageStorageReady() });
  try {
    const image = db
      .prepare(
        'SELECT o.* FROM image_objects o WHERE o.id=? AND EXISTS(SELECT 1 FROM product_images WHERE image_id=o.id)',
      )
      .get(Number(params.get('id'))) as { object_key: string } | undefined;
    if (!image) return new Response('Image not found', { status: 404 });
    return new Response(await readImage(image.object_key), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Image storage unavailable', { status: 503 });
  }
}
async function handlePOST(request: Request) {
  let key: string | undefined;
  try {
    const data = await request.formData();
    const id = Number(data.get('product_id'));
    product(db, id);
    const file = data.get('file');
    if (!(file instanceof File)) throw Error('Choose an image.');
    key = await storeImage(file);
    db.transaction(() => {
      const created = db
        .prepare(
          "INSERT INTO image_objects(object_key,content_type) VALUES (?,'image/webp')",
        )
        .run(key);
      const has = db
        .prepare('SELECT image_id FROM product_images WHERE product_id=?')
        .get(id);
      db.prepare(
        'INSERT INTO product_images(product_id,image_id,is_primary) VALUES (?,?,?)',
      ).run(id, created.lastInsertRowid, has ? 0 : 1);
      event(db, id, 'Image uploaded', {
        image_id: Number(created.lastInsertRowid),
      });
    }).immediate();
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (key) await deleteImage(key).catch(() => {});
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Image upload failed.' },
      { status: 400 },
    );
  }
}
async function handlePATCH(request: Request) {
  try {
    const p = await request.json();
    const image = db
      .prepare('SELECT * FROM product_images WHERE product_id=? AND image_id=?')
      .get(Number(p.product_id), Number(p.image_id));
    if (!image) throw Error('Image association not found.');
    db.transaction(() => {
      db.prepare(
        'UPDATE product_images SET is_primary=0 WHERE product_id=?',
      ).run(p.product_id);
      db.prepare(
        'UPDATE product_images SET is_primary=1 WHERE product_id=? AND image_id=?',
      ).run(p.product_id, p.image_id);
    }).immediate();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Image update failed.' },
      { status: 400 },
    );
  }
}
async function handleDELETE(request: Request) {
  try {
    const p = await request.json();
    if (p.confirm !== true) throw Error('Confirm image removal.');
    const object = db
      .prepare(
        'SELECT o.* FROM image_objects o JOIN product_images i ON i.image_id=o.id WHERE i.product_id=? AND o.id=?',
      )
      .get(Number(p.product_id), Number(p.image_id)) as
      { object_key: string } | undefined;
    if (!object) throw Error('Image not found.');
    db.transaction(() => {
      db.prepare(
        'DELETE FROM product_images WHERE product_id=? AND image_id=?',
      ).run(p.product_id, p.image_id);
      if (
        !db
          .prepare(
            'SELECT image_id FROM product_images WHERE product_id=? AND is_primary=1',
          )
          .get(p.product_id)
      )
        db.prepare(
          'UPDATE product_images SET is_primary=1 WHERE product_id=? AND image_id=(SELECT MIN(image_id) FROM product_images WHERE product_id=?)',
        ).run(p.product_id, p.product_id);
      event(db, p.product_id, 'Image removed', { image_id: p.image_id });
    }).immediate();
    if (
      !db
        .prepare('SELECT product_id FROM product_images WHERE image_id=?')
        .get(p.image_id)
    ) {
      await deleteImage(object.object_key);
      db.prepare('DELETE FROM image_objects WHERE id=?').run(p.image_id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Image removal failed.' },
      { status: 400 },
    );
  }
}

export const GET = secured('products', handleGET);

export const POST = secured('products', handlePOST);

export const PATCH = secured('products', handlePATCH);

export const DELETE = secured('products', handleDELETE);
