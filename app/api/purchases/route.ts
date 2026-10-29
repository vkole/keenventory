import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, ensureDatabase } from '@/lib/db';

const purchaseSchema = z.object({
  supplier: z.string().min(1),
  total_cost: z.coerce.number().default(0),
  status: z.string().default('Ordered'),
});

export async function GET() {
  ensureDatabase();
  const purchases = db.prepare('SELECT * FROM purchase_orders ORDER BY order_date DESC').all();
  return NextResponse.json({ purchases });
}

export async function POST(request: Request) {
  const body = await request.json();
  const payload = purchaseSchema.parse(body);

  const result = db
    .prepare(
      `INSERT INTO purchase_orders (supplier, status, order_date, total_cost, expected_delivery)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(payload.supplier, payload.status, new Date().toISOString(), payload.total_cost, new Date(Date.now() + 7 * 86400000).toISOString());

  return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) });
}
