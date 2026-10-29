import { secured } from '@/lib/access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, ensureDatabase } from '@/lib/db';

const orderSchema = z.object({
  customer: z.string().min(1),
  total: z.coerce.number().default(0),
  channel: z.string().default('Direct'),
  status: z.string().default('Pending'),
});

async function handleGET() {
  ensureDatabase();
  const orders = db.prepare('SELECT * FROM sales_orders ORDER BY order_date DESC').all();
  return NextResponse.json({ orders });
}

async function handlePOST(request: Request) {
  const body = await request.json();
  const payload = orderSchema.parse(body);

  const result = db
    .prepare(
      `INSERT INTO sales_orders (customer, order_date, status, total, channel)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(payload.customer, new Date().toISOString(), payload.status, payload.total, payload.channel);

  return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) });
}

export const GET = secured('orders', handleGET);

export const POST = secured('orders', handlePOST);
