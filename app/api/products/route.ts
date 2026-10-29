import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, ensureDatabase } from '@/lib/db';

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  category: z.string().default('Candle'),
  stock_quantity: z.coerce.number().default(0),
  cost_per_unit: z.coerce.number().default(0),
  retail_price: z.coerce.number().default(0),
  location: z.string().default('Finished Goods Storage'),
});

export async function GET() {
  ensureDatabase();
  const products = db.prepare('SELECT * FROM products ORDER BY name ASC').all();
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  const body = await request.json();
  const payload = productSchema.parse(body);

  const result = db
    .prepare(
      `INSERT INTO products (name, sku, category, stock_quantity, cost_per_unit, retail_price, location)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      payload.name,
      payload.sku,
      payload.category,
      payload.stock_quantity,
      payload.cost_per_unit,
      payload.retail_price,
      payload.location,
    );

  return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) });
}
