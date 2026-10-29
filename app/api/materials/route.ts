import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, ensureDatabase } from '@/lib/db';

const materialSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  category: z.string().default('Miscellaneous Materials'),
  unit: z.string().default('oz'),
  stock_quantity: z.coerce.number().default(0),
  cost_per_unit: z.coerce.number().default(0),
  reorder_threshold: z.coerce.number().default(0),
  location: z.string().default('Main Storage'),
});

export async function GET() {
  ensureDatabase();
  const materials = db.prepare('SELECT * FROM materials ORDER BY name ASC').all();
  return NextResponse.json({ materials });
}

export async function POST(request: Request) {
  const body = await request.json();
  const payload = materialSchema.parse(body);

  const result = db
    .prepare(
      `INSERT INTO materials (name, sku, category, unit, stock_quantity, cost_per_unit, reorder_threshold, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      payload.name,
      payload.sku,
      payload.category,
      payload.unit,
      payload.stock_quantity,
      payload.cost_per_unit,
      payload.reorder_threshold,
      payload.location,
    );

  return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) });
}
