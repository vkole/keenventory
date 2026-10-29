import { db } from './db';
import { activeProduct, event, product } from './productStore';
import { quantity, decimal } from './production';
import { randomUUID } from 'node:crypto';
export function shopifyReady() {
  return !!(process.env.SHOPIFY_SHOP && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN);
}
export async function shopify(query: string, variables: unknown = {}) {
  const shop = process.env.SHOPIFY_SHOP;
  if (
    !shopifyReady() ||
    !shop ||
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)
  )
    throw Error(
      'Configure SHOPIFY_SHOP and SHOPIFY_ADMIN_ACCESS_TOKEN on the server.',
    );
  const response = await fetch(
    `https://${shop}/admin/api/2026-10/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) throw Error(`Shopify returned HTTP ${response.status}.`);
  const body = await response.json();
  if (body.errors?.length)
    throw Error(
      body.errors.map((e: { message: string }) => e.message).join('; '),
    );
  return body.data;
}
export type Mapping = {
  product_id: number;
  shop: string;
  shopify_product_id: string;
  variant_id: string;
  inventory_item_id: string;
  location_id: string;
  remote_sku: string;
  local_location: string;
};
export function mapping(id: number) {
  const m = db
    .prepare('SELECT * FROM shopify_mappings WHERE product_id=?')
    .get(id) as Mapping | undefined;
  if (!m || m.shop !== process.env.SHOPIFY_SHOP)
    throw Error('Map this product to a variant in the configured store.');
  return m;
}
export function availableAt(id: number, loc: string) {
  const current = db
    .prepare(
      'SELECT quantity,consigned FROM product_locations WHERE product_id=? AND location=?',
    )
    .get(id, loc) as { quantity: number; consigned: number } | undefined;
  const reserved = (
    db
      .prepare(
        "SELECT COALESCE(SUM(l.quantity),0) n FROM sales_order_lines l JOIN sales_orders o ON o.id=l.order_id WHERE l.product_id=? AND l.location=? AND l.fulfilled=0 AND o.status NOT IN ('Cancelled','Fulfilled')",
      )
      .get(id, loc) as { n: number }
  ).n;
  return quantity(
    decimal(current?.quantity ?? 0)
      .minus(current?.consigned ?? 0)
      .minus(reserved),
  );
}
export async function readRemote(m: Mapping) {
  const data = await shopify(
    'query($id:ID!,$location:ID!){inventoryItem(id:$id){id sku inventoryLevel(locationId:$location){quantities(names:["available"]){name quantity}}}}',
    { id: m.inventory_item_id, location: m.location_id },
  );
  if (!data.inventoryItem?.inventoryLevel)
    throw Error('Inventory item is not active at this Shopify location.');
  return {
    sku: data.inventoryItem.sku ?? '',
    quantity: data.inventoryItem.inventoryLevel.quantities[0]?.quantity ?? 0,
  };
}
export async function previewPush(id: number) {
  activeProduct(db, id);
  const m = mapping(id);
  const local = availableAt(id, m.local_location || product(db, id).location);
  if (!Number.isInteger(local) || local < 0)
    throw Error(
      'Shopify stock pushes require a nonnegative whole-unit available quantity.',
    );
  const remote = await readRemote(m);
  const request_key = randomUUID();
  const record = db
    .prepare(
      "INSERT INTO push_activity(product_id,request_key,operation,status,local_quantity,remote_quantity,mapping_snapshot) VALUES (?,?,'Inventory','Preview',?,?,?)",
    )
    .run(id, request_key, local, remote.quantity, JSON.stringify(m));
  return {
    id: Number(record.lastInsertRowid),
    local,
    remote: remote.quantity,
    remote_sku: remote.sku,
    sku: product(db, id).sku,
    location: m.local_location,
    shop: m.shop,
  };
}
export async function submitPush(id: number, previewId: number) {
  const row = db
    .prepare(
      "SELECT * FROM push_activity WHERE id=? AND product_id=? AND operation='Inventory'",
    )
    .get(previewId, id) as
    | {
        status: string;
        mapping_snapshot: string;
        local_quantity: number;
        remote_quantity: number;
        request_key: string;
      }
    | undefined;
  if (!row) throw Error('Preview this stock push first.');
  if (row.status === 'Success') return;
  activeProduct(db, id);
  const m = mapping(id);
  if (JSON.stringify(m) !== row.mapping_snapshot)
    throw Error('Mapping changed. Preview again.');
  if (
    availableAt(id, m.local_location || product(db, id).location) !==
    row.local_quantity
  )
    throw Error('Local available inventory changed. Preview again.');
  try {
    const result = await shopify(
      'mutation($input:InventorySetQuantitiesInput!,$key:String!){inventorySetQuantities(input:$input) @idempotent(key:$key){userErrors{message} inventoryAdjustmentGroup{createdAt}}}',
      {
        key: row.request_key,
        input: {
          name: 'available',
          reason: 'correction',
          referenceDocumentUri: `keenventory://stock-push/${previewId}`,
          quantities: [
            {
              inventoryItemId: m.inventory_item_id,
              locationId: m.location_id,
              quantity: row.local_quantity,
              changeFromQuantity: row.remote_quantity,
            },
          ],
        },
      },
    );
    const errors = result.inventorySetQuantities.userErrors;
    if (errors?.length)
      throw Error(errors.map((e: { message: string }) => e.message).join('; '));
    db.prepare(
      "UPDATE push_activity SET status='Success',result='Inventory quantity updated',updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(previewId);
  } catch (e) {
    db.prepare(
      "UPDATE push_activity SET status='Error',result=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(e instanceof Error ? e.message : 'Stock push failed.', previewId);
    throw e;
  }
}
export async function reconcileSku(id: number, direction: string) {
  const m = mapping(id);
  const remote = await readRemote(m);
  const p = activeProduct(db, id);
  if (direction === 'pull') {
    if (!remote.sku || !/^[A-Za-z0-9._+&-]+$/.test(remote.sku))
      throw Error('Shopify SKU is blank or unsupported.');
    if (
      db
        .prepare('SELECT id FROM products WHERE sku=? COLLATE NOCASE AND id<>?')
        .get(remote.sku, id)
    )
      throw Error('Shopify SKU is already used locally.');
    db.transaction(() => {
      db.prepare(
        'UPDATE products SET sku=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
      ).run(remote.sku, id);
      event(db, id, 'SKU reconciled', {
        direction,
        old: p.sku,
        new: remote.sku,
      });
    }).immediate();
  } else if (direction === 'push') {
    const result = await shopify(
      'mutation($id:ID!,$input:InventoryItemInput!){inventoryItemUpdate(id:$id,input:$input){inventoryItem{id sku} userErrors{message}}}',
      { id: m.inventory_item_id, input: { sku: p.sku } },
    );
    if (result.inventoryItemUpdate.userErrors.length)
      throw Error(
        result.inventoryItemUpdate.userErrors
          .map((e: { message: string }) => e.message)
          .join('; '),
      );
    event(db, id, 'SKU reconciled', { direction, old: remote.sku, new: p.sku });
  } else throw Error('Choose reconciliation direction.');
  db.prepare(
    "UPDATE shopify_mappings SET remote_sku=?,sync_status='SKU reconciled',updated_at=CURRENT_TIMESTAMP WHERE product_id=?",
  ).run(direction === 'pull' ? remote.sku : p.sku, id);
}
