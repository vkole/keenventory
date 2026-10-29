import { secured } from '@/lib/access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, ensureDatabase } from '@/lib/db';

const stocktakeSchema = z.object({
  location: z.string().default('Main Storage'),
  inventory_name: z.string().min(1),
  actual_quantity: z.coerce.number(),
});

async function handleGET() {
  ensureDatabase();
  const stocktakes = db.prepare('SELECT * FROM stocktakes ORDER BY created_at DESC').all();
  return NextResponse.json({ stocktakes });
}

async function handlePOST(request: Request) {
  const body = await request.json();
  const payload = stocktakeSchema.parse(body);

  const material = db.prepare('SELECT * FROM materials WHERE name = ?').get(payload.inventory_name) as { stock_quantity: number } | undefined;
  const product = db.prepare('SELECT * FROM products WHERE name = ?').get(payload.inventory_name) as { stock_quantity: number } | undefined;
  const systemQuantity = Number(material?.stock_quantity ?? product?.stock_quantity ?? 0);
  const variance = Number(payload.actual_quantity) - Number(systemQuantity);

  const result = db
    .prepare(
      `INSERT INTO stocktakes (location, inventory_name, system_quantity, actual_quantity, variance, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(payload.location, payload.inventory_name, systemQuantity, payload.actual_quantity, variance, 'Open');

  return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid), system_quantity: systemQuantity, variance });
}

export const GET = secured('stocktakes', handleGET);

export const POST = secured('stocktakes', handlePOST);
