import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, ensureDatabase } from '@/lib/db';

const orderSchema = z.object({
  customer: z.string().min(1),
  total: z.coerce.number().default(0),
  channel: z.string().default('Direct'),
  status: z.string().default('Pending'),
});

export async function GET() {
  ensureDatabase();
  const orders = db.prepare('SELECT * FROM sales_orders ORDER BY order_date DESC').all();
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
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
