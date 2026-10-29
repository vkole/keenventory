import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, ensureDatabase } from '@/lib/db';

const ingredientSchema = z.object({
  item_name: z.string().min(1),
  quantity: z.coerce.number(),
  unit: z.string().default('oz'),
  item_type: z.string().default('material'),
});

const recipeSchema = z.object({
  name: z.string().default(''),
  product_id: z.coerce.number().default(1),
  version: z.coerce.number().default(1),
  batch_yield: z.coerce.number().default(1),
  batch_minutes: z.coerce.number().default(0),
  hourly_labor_rate: z.coerce.number().default(0),
  status: z.string().default('Draft'),
  instructions: z.string().default('Melt and combine ingredients.'),
  notes: z.string().default(''),
  ingredients: z.array(ingredientSchema).default([]),
});

export async function GET() {
  ensureDatabase();
  const recipes = db.prepare('SELECT * FROM recipes ORDER BY created_at DESC').all() as Array<
    Omit<z.infer<typeof recipeSchema>, 'ingredients'> & { id: number }
  >;
  const items = db.prepare('SELECT * FROM recipe_items ORDER BY recipe_id, id').all() as Array<
    z.infer<typeof ingredientSchema> & { id: number; recipe_id: number }
  >;

  const payload = recipes.map((recipe) => ({
    ...recipe,
    ingredients: items.filter((item) => item.recipe_id === recipe.id),
  }));

  return NextResponse.json({ recipes: payload });
}

export async function POST(request: Request) {
  const body = await request.json();
  const payload = recipeSchema.parse(body);
  ensureDatabase();

  const productName = db.prepare('SELECT name FROM products WHERE id = ?').get(payload.product_id) as { name?: string } | undefined;
  const name = payload.name && payload.name.trim() ? payload.name.trim() : (productName?.name ?? 'Recipe');

  const result = db
    .prepare(
      `INSERT INTO recipes (name, product_id, version, batch_yield, batch_minutes, hourly_labor_rate, status, instructions, notes, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      payload.product_id,
      payload.version,
      payload.batch_yield,
      payload.batch_minutes,
      payload.hourly_labor_rate,
      payload.status,
      payload.instructions,
      payload.notes,
      payload.status === 'Active' ? 1 : 0,
      new Date().toISOString()
    );

  const recipeId = Number(result.lastInsertRowid);

  const insertIngredients = db.prepare(
    `INSERT INTO recipe_items (recipe_id, item_name, quantity, unit, item_type)
     VALUES (?, ?, ?, ?, ?)`
  );

  for (const ingredient of payload.ingredients) {
    insertIngredients.run(recipeId, ingredient.item_name, ingredient.quantity, ingredient.unit, ingredient.item_type);
  }

  return NextResponse.json({ ok: true, id: recipeId, name });
}
