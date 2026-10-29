import { secured } from '@/lib/access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { activeProduct, event } from '@/lib/productStore';
import {
  shopify,
  shopifyReady,
  previewPush,
  submitPush,
  reconcileSku,
  mapping,
  readRemote,
} from '@/lib/shopify';
export const dynamic = 'force-dynamic';
async function handleGET() {
  try {
    if (!shopifyReady())
      return NextResponse.json({
        configured: false,
        shop: process.env.SHOPIFY_SHOP ?? '',
        locations: [],
      });
    const data = await shopify('query{locations(first:100){nodes{id name}}}');
    return NextResponse.json({
      configured: true,
      shop: process.env.SHOPIFY_SHOP,
      locations: data.locations.nodes,
    });
  } catch (e) {
    return NextResponse.json({
      configured: false,
      error: e instanceof Error ? e.message : 'Connection failed.',
      locations: [],
    });
  }
}
async function handlePOST(request: Request) {
  try {
    const p = await request.json();
    const id = z.number().int().positive().parse(p.id);
    if (p.action === 'map') {
      activeProduct(db, id);
      const variant = z
        .string()
        .regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/)
        .parse(p.variant_id);
      const loc = z
        .string()
        .regex(/^gid:\/\/shopify\/Location\/\d+$/)
        .parse(p.location_id);
      const local = z.string().trim().min(1).parse(p.local_location);
      if (
        !db
          .prepare(
            'SELECT product_id FROM product_locations WHERE product_id=? AND location=?',
          )
          .get(id, local)
      )
        throw Error('Choose an existing local inventory location.');
      const data = await shopify(
        'query($id:ID!,$location:ID!){productVariant(id:$id){id sku product{id} inventoryItem{id inventoryLevel(locationId:$location){id}}} location(id:$location){id}}',
        { id: variant, location: loc },
      );
      if (!data.productVariant?.inventoryItem?.inventoryLevel || !data.location)
        throw Error(
          'Choose an existing variant stocked at this Shopify location.',
        );
      const old = db
        .prepare('SELECT * FROM shopify_mappings WHERE product_id=?')
        .get(id) as { variant_id: string; shop: string } | undefined;
      if (
        old &&
        (old.variant_id !== variant || old.shop !== process.env.SHOPIFY_SHOP)
      )
        throw Error(
          'A permanent mapping already exists; it cannot be silently reassigned.',
        );
      db.prepare(
        'INSERT INTO shopify_mappings(product_id,shop,shopify_product_id,variant_id,inventory_item_id,location_id,remote_sku,local_location) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET location_id=excluded.location_id,local_location=excluded.local_location,remote_sku=excluded.remote_sku',
      ).run(
        id,
        process.env.SHOPIFY_SHOP,
        data.productVariant.product.id,
        variant,
        data.productVariant.inventoryItem.id,
        loc,
        data.productVariant.sku ?? '',
        local,
      );
      event(db, id, 'Shopify mapping', {
        variant_id: variant,
        location_id: loc,
      });
      return NextResponse.json({ ok: true });
    }
    if (p.action === 'preview') return NextResponse.json(await previewPush(id));
    if (p.action === 'push') {
      if (p.confirm !== true) throw Error('Confirm the inventory push.');
      await submitPush(id, z.number().int().positive().parse(p.preview_id));
    } else if (p.action === 'reconcile') {
      if (p.confirm !== true) throw Error('Confirm SKU reconciliation.');
      await reconcileSku(id, p.direction);
    } else if (p.action === 'refresh') {
      const remote = await readRemote(mapping(id));
      db.prepare(
        "UPDATE shopify_mappings SET remote_sku=?,sync_status='Checked',updated_at=CURRENT_TIMESTAMP WHERE product_id=?",
      ).run(remote.sku, id);
    } else throw Error('Unsupported Shopify action.');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Shopify action failed.' },
      { status: 400 },
    );
  }
}

export const GET = secured('integrations', handleGET);

export const POST = secured('integrations', handlePOST);
