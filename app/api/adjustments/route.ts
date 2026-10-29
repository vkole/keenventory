import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, ensureDatabase } from '@/lib/db';

const adjustmentSchema = z.object({
  item_name: z.string().min(1),
  quantity: z.coerce.number(),
  reason: z.string().min(1),
});

export async function GET() {
  ensureDatabase();
  const adjustments = db.prepare('SELECT * FROM adjustments ORDER BY created_at DESC').all();
  return NextResponse.json({ adjustments });
}

export async function POST(request: Request) {
  const body = await request.json();
  const payload = adjustmentSchema.parse(body);

  const result = db
    .prepare(
      `INSERT INTO adjustments (item_name, quantity, reason)
       VALUES (?, ?, ?)`
    )
    .run(payload.item_name, payload.quantity, payload.reason);

  return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) });
}
