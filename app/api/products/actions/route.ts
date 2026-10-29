import { secured } from '@/lib/access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  activeProduct,
  event,
  moveStock,
  product,
  productDetail,
  references,
  saveProduct,
} from '@/lib/productStore';
import { decimal, quantity, money } from '@/lib/production';
const amount = z.coerce
  .number()
  .finite()
  .nonnegative()
  .max(1e9)
  .multipleOf(0.000001);
const qty = amount.positive();
const location = z.string().trim().min(1);
const reason = z.string().trim().min(1);
const key = z.string().uuid();
async function handlePOST(request: Request) {
  try {
    const body = await request.json();
    const id = z.number().int().positive().parse(body.id);
    const action = z.string().parse(body.action);
    const result = db
      .transaction(() => {
        const p = product(db, id);
        if (action === 'attributes') {
          const attributes = z
            .record(z.string().min(1), z.array(z.string().trim().min(1)).min(1))
            .parse(body.attributes);
          if (db.prepare('SELECT id FROM products WHERE parent_id=?').get(id)) {
            const old = JSON.parse(p.attribute_definitions);
            for (const [k, vals] of Object.entries(old) as [string, string[]][])
              if (
                !attributes[k] ||
                vals.some((v) => !attributes[k].includes(v))
              )
                throw Error(
                  'Existing variation attributes cannot be removed. Add new values instead.',
                );
          }
          db.prepare(
            'UPDATE products SET attribute_definitions=? WHERE id=?',
          ).run(JSON.stringify(attributes), id);
          event(db, id, 'Attributes updated', attributes);
          return { id };
        }
        if (action === 'archive' || action === 'restore') {
          if (body.confirm !== true) throw Error('Confirmation required.');
          if (action === 'restore' && p.merged_into_id)
            throw Error('A merged product cannot be restored.');
          db.prepare(
            'UPDATE products SET archived_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
          ).run(action === 'archive' ? new Date().toISOString() : null, id);
          event(db, id, action, {});
          return { id };
        }
        if (action === 'delete') {
          if (body.confirm !== true) throw Error('Confirm permanent deletion.');
          const refs = references(db, id);
          if (
            p.stock_quantity ||
            Object.values(refs).some((n) => n > 0) ||
            db.prepare('SELECT id FROM products WHERE merged_into_id=?').get(id)
          )
            throw Error(
              'This product has stock or protected history. Archive it instead.',
            );
          db.prepare('DELETE FROM product_images WHERE product_id=?').run(id);
          db.prepare('DELETE FROM product_locations WHERE product_id=?').run(
            id,
          );
          db.prepare('DELETE FROM product_events WHERE product_id=?').run(id);
          db.prepare('DELETE FROM products WHERE id=?').run(id);
          return { deleted: true };
        }
        if (action === 'copy') {
          const newId = saveProduct(db, {
            ...p,
            id: undefined,
            name: z.string().min(1).parse(body.name),
            sku: z.string().min(1).parse(body.sku),
            stock_quantity: 0,
            attributes: JSON.parse(p.attributes),
            auto_manufacture: !!p.auto_manufacture,
            parent_id: p.parent_id,
          });
          db.prepare(
            'UPDATE products SET attribute_definitions=? WHERE id=?',
          ).run(p.attribute_definitions, newId);
          if (body.copy_images === true)
            db.prepare(
              'INSERT INTO product_images(product_id,image_id,is_primary) SELECT ?,image_id,is_primary FROM product_images WHERE product_id=?',
            ).run(newId, id);
          event(db, newId, 'Copied', {
            source_id: id,
            images: body.copy_images === true,
          });
          return { id: newId };
        }
        if (!['fulfill', 'receive'].includes(action)) activeProduct(db, id);
        if (action === 'transfer') {
          const from = location.parse(body.from);
          const to = location.parse(body.to);
          const n = qty.parse(body.quantity);
          const k = key.parse(body.request_key);
          if (from === to) throw Error('Choose different locations.');
          moveStock(db, {
            id,
            location: from,
            delta: -n,
            kind: 'Transfer out',
            reason: reason.parse(body.reason),
            request_key: k + ':out',
          });
          moveStock(db, {
            id,
            location: to,
            delta: n,
            kind: 'Transfer in',
            reason: body.reason,
            request_key: k + ':in',
          });
          return { id };
        }
        if (action === 'adjust') {
          const n = z.coerce
            .number()
            .finite()
            .min(-1e9)
            .max(1e9)
            .multipleOf(0.000001)
            .parse(body.quantity);
          moveStock(db, {
            id,
            location: location.parse(body.location),
            delta: n,
            kind: 'Adjustment',
            reason: reason.parse(body.reason),
            request_key: key.parse(body.request_key),
          });
          return { id };
        }
        if (action === 'stocktake') {
          const loc = location.parse(body.location);
          const n = amount.parse(body.quantity);
          const k = key.parse(body.request_key);
          if (
            db
              .prepare('SELECT id FROM inventory_ledger WHERE request_key=?')
              .get(k)
          )
            return { id };
          const current =
            (
              db
                .prepare(
                  'SELECT quantity FROM product_locations WHERE product_id=? AND location=?',
                )
                .get(id, loc) as { quantity: number } | undefined
            )?.quantity ?? 0;
          const variance = quantity(decimal(n).minus(current));
          const record = db
            .prepare(
              'INSERT INTO product_stocktakes(product_id,location,system_quantity,actual_quantity,variance,reason) VALUES (?,?,?,?,?,?)',
            )
            .run(id, loc, current, n, variance, reason.parse(body.reason));
          moveStock(db, {
            id,
            location: loc,
            delta: variance,
            kind: 'Stocktake',
            reason: body.reason,
            reference_type: 'stocktake',
            reference_id: Number(record.lastInsertRowid),
            request_key: k,
          });
          return { id };
        }
        if (action === 'order' || action === 'purchase') {
          const n = qty.parse(body.quantity);
          const price = amount.parse(body.price);
          const loc = location.parse(body.location);
          const who = reason.parse(body.contact);
          const k = key.parse(body.request_key);
          const previous = db
            .prepare(
              "SELECT details FROM product_events WHERE product_id=? AND kind=? AND json_extract(details,'$.request_key')=?",
            )
            .get(id, action, k);
          if (previous) return { id };
          if (action === 'order') {
            const reserved = (
              db
                .prepare(
                  "SELECT COALESCE(SUM(l.quantity),0) n FROM sales_order_lines l JOIN sales_orders o ON o.id=l.order_id WHERE l.product_id=? AND l.location=? AND l.fulfilled=0 AND o.status NOT IN ('Cancelled','Fulfilled','Draft')",
                )
                .get(id, loc) as { n: number }
            ).n;
            const balance = db
              .prepare(
                'SELECT quantity,consigned FROM product_locations WHERE product_id=? AND location=?',
              )
              .get(id, loc) as
              { quantity: number; consigned: number } | undefined;
            if (
              decimal(balance?.quantity ?? 0)
                .minus(reserved)
                .minus(balance?.consigned ?? 0)
                .lt(n)
            )
              throw Error('Insufficient available stock at this location.');
            const order = db
              .prepare(
                "INSERT INTO sales_orders(customer,status,total,channel) VALUES (?,'Pending',?,'Direct')",
              )
              .run(who, money(decimal(n).times(price)));
            db.prepare(
              'INSERT INTO sales_order_lines(order_id,product_id,quantity,unit_price,location) VALUES (?,?,?,?,?)',
            ).run(order.lastInsertRowid, id, n, price, loc);
          } else {
            const purchase = db
              .prepare(
                "INSERT INTO purchase_orders(supplier,status,total_cost) VALUES (?,'Ordered',?)",
              )
              .run(who, money(decimal(n).times(price)));
            db.prepare(
              'INSERT INTO purchase_order_lines(purchase_id,product_id,quantity,unit_cost,location) VALUES (?,?,?,?,?)',
            ).run(purchase.lastInsertRowid, id, n, price, loc);
          }
          event(db, id, action, { request_key: k, quantity: n, contact: who });
          return { id };
        }
        if (action === 'fulfill' || action === 'receive') {
          const lineId = z.number().int().positive().parse(body.line_id);
          if (action === 'fulfill') {
            const line = db
              .prepare(
                'SELECT * FROM sales_order_lines WHERE id=? AND product_id=?',
              )
              .get(lineId, id) as
              | {
                  fulfilled: number;
                  quantity: number;
                  location: string;
                  order_id: number;
                }
              | undefined;
            if (!line) throw Error('Order line not found.');
            const order = db.prepare('SELECT status FROM sales_orders WHERE id=?').get(line.order_id) as {status:string};
            if (order.status === 'Cancelled') throw Error('Cancelled orders cannot be fulfilled.');
            if (!line.fulfilled) {
              db.prepare(
                'UPDATE sales_order_lines SET fulfilled=1,cost_at_sale=? WHERE id=?',
              ).run(p.cost_per_unit,lineId);
              moveStock(db, {
                id,
                location: line.location,
                delta: -line.quantity,
                kind: 'Sale',
                reason: 'Order fulfillment',
                reference_type: 'order',
                reference_id: line.order_id,
                request_key: `order:${lineId}`,
              });
              db.prepare(
                "UPDATE sales_orders SET status='Fulfilled' WHERE id=? AND NOT EXISTS (SELECT id FROM sales_order_lines WHERE order_id=? AND fulfilled=0)",
              ).run(line.order_id, line.order_id);
            }
          } else {
            const line = db
              .prepare(
                'SELECT * FROM purchase_order_lines WHERE id=? AND product_id=?',
              )
              .get(lineId, id) as
              | {
                  received: number;
                  quantity: number;
                  location: string;
                  purchase_id: number;
                  unit_cost: number;
                }
              | undefined;
            if (!line) throw Error('Purchase line not found.');
            const purchase = db.prepare('SELECT status FROM purchase_orders WHERE id=?').get(line.purchase_id) as {status:string};
            if (purchase.status === 'Cancelled') throw Error('Cancelled purchases cannot be received.');
            if (!line.received) {
              moveStock(db, {
                id,
                location: line.location,
                delta: line.quantity,
                kind: 'Purchase',
                reason: 'Purchase receipt',
                reference_type: 'purchase',
                reference_id: line.purchase_id,
                request_key: `purchase:${lineId}`,
              });
              const total = decimal(p.stock_quantity)
                .times(p.cost_per_unit)
                .plus(decimal(line.quantity).times(line.unit_cost));
              db.prepare('UPDATE products SET cost_per_unit=? WHERE id=?').run(
                quantity(
                  total.div(decimal(p.stock_quantity).plus(line.quantity)),
                ),
                id,
              );
              db.prepare('UPDATE inventory_ledger SET unit_cost=(SELECT cost_per_unit FROM products WHERE id=?) WHERE request_key=?').run(id,`purchase:${lineId}`);
              db.prepare(
                'UPDATE purchase_order_lines SET received=1 WHERE id=?',
              ).run(lineId);
              db.prepare(
                "UPDATE purchase_orders SET status='Received' WHERE id=? AND NOT EXISTS(SELECT id FROM purchase_order_lines WHERE purchase_id=? AND received=0)",
              ).run(line.purchase_id, line.purchase_id);
            }
          }
          return { id };
        }
        if (action === 'componentize') {
          if (body.confirm !== true) throw Error('Confirm conversion.');
          const n = qty.parse(body.quantity);
          const sku = z.string().trim().min(1).parse(body.sku);
          const loc = location.parse(body.location);
          const k = key.parse(body.request_key);
          if (
            db
              .prepare('SELECT id FROM inventory_ledger WHERE request_key=?')
              .get(k)
          )
            return { id };
          let m = db.prepare('SELECT * FROM materials WHERE sku=?').get(sku) as
            | {
                id: number;
                unit: string;
                stock_quantity: number;
                cost_per_unit: number;
              }
            | undefined;
          if (m && m.unit !== p.measurement_type)
            throw Error('Component tracking unit must match the product.');
          moveStock(db, {
            id,
            location: loc,
            delta: -n,
            kind: 'Component conversion',
            reason: reason.parse(body.reason),
            request_key: k,
          });
          if (!m) {
            const created = db
              .prepare(
                "INSERT INTO materials(name,sku,category,unit,stock_quantity,cost_per_unit,location) VALUES (?,?,'Component',?,0,?,?)",
              )
              .run(p.name, sku, p.measurement_type, p.cost_per_unit, loc);
            m = {
              id: Number(created.lastInsertRowid),
              unit: p.measurement_type,
              stock_quantity: 0,
              cost_per_unit: p.cost_per_unit,
            };
          }
          const balance = quantity(decimal(m.stock_quantity).plus(n));
          const cost = quantity(
            decimal(m.stock_quantity)
              .times(m.cost_per_unit)
              .plus(decimal(n).times(p.cost_per_unit))
              .div(balance),
          );
          db.prepare(
            'UPDATE materials SET stock_quantity=?,cost_per_unit=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
          ).run(balance, cost, m.id);
          db.prepare(
            "INSERT INTO inventory_ledger(material_id,location,delta,balance,kind,reason,reference_type,reference_id) VALUES (?,?,?,?,'Component conversion',?,'product',?)",
          ).run(m.id, loc, n, balance, body.reason, id);
          event(db, id, 'Componentized', { material_id: m.id, quantity: n });
          return { id };
        }
        if (action === 'merge') {
          const targetId = z.number().int().positive().parse(body.target_id);
          if (targetId === id) throw Error('Choose a different product.');
          const target = activeProduct(db, targetId);
          if (body.confirm !== true)
            return {
              preview: {
                source: productDetail(db, id),
                target: productDetail(db, targetId),
              },
            };
          if (
            p.measurement_type !== target.measurement_type ||
            p.parent_id !== target.parent_id
          )
            throw Error(
              'Products must have compatible units and variation parents.',
            );
          if (
            references(db, id).variations ||
            references(db, targetId).variations
          )
            throw Error(
              'Merge individual products or variations, not variation parents.',
            );
          if (
            p.reserved ||
            p.consigned ||
            db.prepare("SELECT l.id FROM purchase_order_lines l JOIN purchase_orders o ON o.id=l.purchase_id WHERE l.product_id=? AND l.received=0 AND o.status<>'Cancelled'").get(id) ||
            db
              .prepare(
                "SELECT id FROM manufacturing_batches WHERE product_id=? AND status IN ('Draft','Scheduled','In Progress')",
              )
              .get(id)
          )
            throw Error(
              'Complete open manufacturing, orders, purchases, and consignment before merging.',
            );
          const a = db
            .prepare('SELECT * FROM shopify_mappings WHERE product_id=?')
            .get(id);
          const b = db
            .prepare('SELECT * FROM shopify_mappings WHERE product_id=?')
            .get(targetId);
          if (a && b)
            throw Error(
              'Both products have Shopify mappings. Reconcile mappings before merging.',
            );
          for (const loc of db
            .prepare(
              'SELECT * FROM product_locations WHERE product_id=? AND quantity>0',
            )
            .all(id) as { location: string; quantity: number }[]) {
            moveStock(db, {
              id,
              location: loc.location,
              delta: -loc.quantity,
              kind: 'Merge out',
              reason: `Merged into product ${targetId}`,
            });
            moveStock(db, {
              id: targetId,
              location: loc.location,
              delta: loc.quantity,
              kind: 'Merge in',
              reason: `Merged from product ${id}`,
            });
          }
          const combined = decimal(p.stock_quantity).plus(
            target.stock_quantity,
          );
          if (combined.gt(0))
            db.prepare('UPDATE products SET cost_per_unit=? WHERE id=?').run(
              quantity(
                decimal(p.stock_quantity)
                  .times(p.cost_per_unit)
                  .plus(
                    decimal(target.stock_quantity).times(target.cost_per_unit),
                  )
                  .div(combined),
              ),
              targetId,
            );
          if (a)
            db.prepare(
              'UPDATE shopify_mappings SET product_id=? WHERE product_id=?',
            ).run(targetId, id);
          db.prepare('UPDATE recipes SET product_id=? WHERE product_id=?').run(
            targetId,
            id,
          );
          db.prepare(
            'UPDATE products SET archived_at=CURRENT_TIMESTAMP,merged_into_id=? WHERE id=?',
          ).run(targetId, id);
          event(db, id, 'Merged', { target_id: targetId });
          event(db, targetId, 'Merge received', { source_id: id });
          return { id: targetId };
        }
        throw Error('Unsupported product action.');
      })
      .immediate();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Product action failed.' },
      { status: 400 },
    );
  }
}

export const POST = secured('products', handlePOST);
