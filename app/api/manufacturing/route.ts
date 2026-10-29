import { secured } from '@/lib/access';
import { viewer } from '@/lib/access';
import { can } from '@/lib/permissions';
import type { Snapshot } from '@/lib/manufacturing';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createBatch, completeBatch, inventory } from '@/lib/manufacturing';
const amount = z
  .number()
  .finite()
  .nonnegative()
  .max(1000000000)
  .multipleOf(0.000001);
const create = z.object({
  request_key: z.string().uuid(),
  product_id: z.number().int().positive(),
  recipe_id: z.number().int().positive(),
  planned_quantity: z.number().int().positive().max(1000000),
});
const complete = z.object({
  id: z.number().int().positive(),
  actual_quantity: z.number().int().nonnegative().max(1000000),
  actual_minutes: amount,
  hourly_labor_rate: amount,
  consumption: z.array(
    z.object({ material_id: z.number().int().positive(), quantity: amount }),
  ),
});
async function handleGET() {
  return NextResponse.json({
    batches: db
      .prepare('SELECT * FROM manufacturing_batches ORDER BY id DESC')
      .all(),
    materials: inventory(db),
  });
}
async function handlePOST(request: Request) {
  try {
    const id = createBatch(db, create.parse(await request.json()));
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Batch creation failed.' },
      { status: 400 },
    );
  }
}
async function handlePATCH(request: Request) {
  try {
    const body=await request.json();
    const user=(await viewer(request.headers))!;
    if(!can(user,'materialCosts','edit')) {
      const batch=db.prepare('SELECT recipe_snapshot FROM manufacturing_batches WHERE id=?').get(body.id) as {recipe_snapshot:string}|undefined;
      if(!batch?.recipe_snapshot) throw Error('Batch snapshot unavailable.');
      const snapshot=JSON.parse(batch.recipe_snapshot) as Snapshot;
      body.hourly_labor_rate=snapshot.hourly_labor_rate??0;
    }
    completeBatch(db, complete.parse(body));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Completion failed.' },
      { status: 400 },
    );
  }
}

export const GET = secured('manufacturing', handleGET);

export const POST = secured('manufacturing', handlePOST);

export const PATCH = secured('manufacturing', handlePATCH);
