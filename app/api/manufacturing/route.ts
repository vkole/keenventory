import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, ensureDatabase } from '@/lib/db';

const manufacturingSchema = z.object({
  product_id: z.coerce.number(),
  recipe_id: z.coerce.number(),
  planned_quantity: z.coerce.number().min(1),
});

export async function POST(request: Request) {
  const body = await request.json();
  const payload = manufacturingSchema.parse(body);
  ensureDatabase();

  try {
    const tx = db.transaction(() => {
      const recipeItems = db.prepare('SELECT * FROM recipe_items WHERE recipe_id = ?').all(payload.recipe_id) as Array<{
        item_name: string;
        quantity: number;
        unit: string;
        item_type: string;
      }>;

      for (const item of recipeItems) {
        const required = Number(item.quantity) * Number(payload.planned_quantity);
        const material = db.prepare('SELECT * FROM materials WHERE name = ?').get(item.item_name) as { stock_quantity: number } | undefined;

        if (item.item_type === 'material' && material && material.stock_quantity < required) {
          throw new Error(`Insufficient availability for ${item.item_name}. Required ${required}, available ${material.stock_quantity}.`);
        }
      }

      for (const item of recipeItems) {
        const required = Number(item.quantity) * Number(payload.planned_quantity);

        if (item.item_type === 'material') {
          db.prepare('UPDATE materials SET stock_quantity = stock_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?').run(required, item.item_name);
        }
      }

      db.prepare('UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(payload.planned_quantity, payload.product_id);

      const result = db
        .prepare(
          `INSERT INTO manufacturing_batches (product_id, recipe_id, status, planned_quantity, completed_quantity, completed_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(payload.product_id, payload.recipe_id, 'In Progress', payload.planned_quantity, payload.planned_quantity, new Date().toISOString(), new Date().toISOString());

      return Number(result.lastInsertRowid);
    });

    const batchId = tx();
    return NextResponse.json({ ok: true, id: batchId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Manufacturing batch failed.' },
      { status: 400 }
    );
  }
}
