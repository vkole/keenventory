import { featureApi } from "@/lib/featureApi";
import { detachMedia, removeDetachedMedia } from "@/lib/attachmentCleanup";
import { secured, viewer, requirePermission } from "@/lib/access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Stock } from "@/lib/production";
import { activeProduct } from "@/lib/productStore";

const positive = z.coerce.number().finite().positive();
const nonnegative = z.coerce.number().finite().nonnegative();
const schema = z.object({
  id: positive.int().optional(),
  copy_from: positive.int().optional(),
  name: z.string().trim().min(1),
  product_id: positive.int(),
  product_variant: z.string().default(""),
  measurement_unit: z.string().min(1).default("candles"),
  version: positive.int(),
  batch_yield: positive.int(),
  batch_minutes: nonnegative,
  hourly_labor_rate: nonnegative.optional(),
  labor_mode: z.enum(["fixed", "per_unit", "scaled"]).default("fixed"),
  labor_reference_yield: positive.default(1),
  overhead: nonnegative.optional(),
  status: z.enum(["Draft", "Active", "Archived"]).default("Draft"),
  instructions: z.string().default(""),
  notes: z.string().default(""),
  description: z.string().default(""),
  preparation_notes: z.string().default(""),
  safety_notes: z.string().default(""),
  ingredients: z
    .array(
      z.object({
        material_id: positive
          .int()
          .nullish()
          .transform((value) => value ?? undefined),
        item_name: z.string().min(1),
        quantity: positive,
        unit: z.string().min(1),
        item_type: z.enum(["material", "component"]),
      }),
    )
    .min(1),
});
async function handleGET() {
  const recipes = db
    .prepare("SELECT * FROM recipes ORDER BY created_at DESC")
    .all() as { id: number }[];
  const items = db.prepare("SELECT * FROM recipe_items ORDER BY id").all() as {
    recipe_id: number;
  }[];
  return NextResponse.json({
    recipes: recipes.map((r) => ({
      ...r,
      ingredients: items.filter((i) => i.recipe_id === r.id),
    })),
  });
}
async function handlePOST(request: Request) {
  try {
    const user = (await viewer(request.headers))!;
    const p = schema.parse(await request.json());
    const id = db.transaction(() => {
      if (!db.prepare("SELECT id FROM products WHERE id = ?").get(p.product_id))
        throw new Error("Choose an existing product.");
      activeProduct(db, p.product_id);
      if (p.id && !db.prepare("SELECT id FROM recipes WHERE id = ?").get(p.id))
        throw new Error("Recipe no longer exists.");
      const items = p.ingredients.map((i) => {
        const m = (
          i.material_id
            ? db
                .prepare("SELECT * FROM materials WHERE id = ?")
                .get(i.material_id)
            : db
                .prepare("SELECT * FROM materials WHERE name = ?")
                .get(i.item_name)
        ) as Stock | undefined;
        if (!m || m.unit !== i.unit)
          throw new Error(
            `Select inventory with matching units for ${i.item_name}.`,
          );
        return { ...i, material_id: m.id, item_name: m.name };
      });
      const sourceId = p.id ?? p.copy_from;
      const old = sourceId
        ? (db
            .prepare(
              "SELECT hourly_labor_rate,overhead FROM recipes WHERE id=?",
            )
            .get(sourceId) as { hourly_labor_rate: number; overhead: number })
        : undefined;
      const values = [
        p.name,
        p.product_id,
        p.version,
        p.batch_yield,
        p.batch_minutes,
        p.hourly_labor_rate ?? old?.hourly_labor_rate ?? 0,
        p.status,
        p.instructions,
        p.notes,
        p.status === "Active" ? 1 : 0,
        p.product_variant,
        p.measurement_unit,
        p.labor_mode,
        p.labor_reference_yield,
        p.overhead ?? old?.overhead ?? 0,
      ];
      let recipeId = p.id;
      if (recipeId) {
        db.prepare(
          "UPDATE recipes SET name=?, product_id=?, version=?, batch_yield=?, batch_minutes=?, hourly_labor_rate=?, status=?, instructions=?, notes=?, is_active=?, product_variant=?, measurement_unit=?, labor_mode=?, labor_reference_yield=?, overhead=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(...values, recipeId);
        db.prepare("DELETE FROM recipe_items WHERE recipe_id=?").run(recipeId);
      } else {
        recipeId = Number(
          db
            .prepare(
              "INSERT INTO recipes (name, product_id, version, batch_yield, batch_minutes, hourly_labor_rate, status, instructions, notes, is_active, product_variant, measurement_unit, labor_mode, labor_reference_yield, overhead) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .run(...values).lastInsertRowid,
        );
      }
      db.prepare(
        "UPDATE recipes SET description=?,preparation_notes=?,safety_notes=? WHERE id=?",
      ).run(p.description, p.preparation_notes, p.safety_notes, recipeId);
      if (!p.id && p.copy_from) {
        requirePermission(user, "recipes");
        if (!db.prepare("SELECT id FROM recipes WHERE id=?").get(p.copy_from))
          throw Error("Original recipe not found.");
        db.prepare(
          "INSERT INTO attachments(owner_type,owner_id,object_key,filename,content_type,size,is_primary,created_by) SELECT 'recipe',?,object_key,filename,content_type,size,is_primary,? FROM attachments WHERE owner_type='recipe' AND owner_id=?",
        ).run(recipeId, user.id, p.copy_from);
      }
      const insert = db.prepare(
        "INSERT INTO recipe_items (recipe_id, material_id, item_name, quantity, unit, item_type) VALUES (?,?,?,?,?,?)",
      );
      for (const i of items)
        insert.run(
          recipeId,
          i.material_id,
          i.item_name,
          i.quantity,
          i.unit,
          i.item_type,
        );
      return recipeId;
    })();
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Check required fields and positive quantities."
            : e instanceof Error
              ? e.message
              : "Recipe could not be saved.",
      },
      { status: 400 },
    );
  }
}

export const GET = secured("recipes", handleGET);

export const POST = secured("recipes", handlePOST);

export const PATCH = featureApi("recipes", "edit", async (request) => {
  const p = await request.json();
  if (p.action !== "archive") throw Error("Choose Archive.");
  if (
    !db
      .prepare(
        "UPDATE recipes SET status='Archived',is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=1",
      )
      .run(Number(p.id)).changes
  )
    throw Error("Recipe not found.");
  return Response.json({ ok: true });
});
export const DELETE = featureApi("recipes", "delete", async (request) => {
  const p = await request.json();
  const id = Number(p.id);
  let keys: string[] = [];
  db.transaction(() => {
    if (
      db
        .prepare(
          "SELECT id FROM manufacturing_batches WHERE recipe_id=? LIMIT 1",
        )
        .get(id)
    )
      throw Error(
        "This recipe has production history. Archive it to preserve that history.",
      );
    db.prepare("DELETE FROM recipe_items WHERE recipe_id=?").run(id);
    if (
      !db
        .prepare("DELETE FROM recipes WHERE id=? AND organization_id=1")
        .run(id).changes
    )
      throw Error("Recipe not found.");
    keys = detachMedia(db, "recipe", id);
  }).immediate();
  await removeDetachedMedia(keys);
  return Response.json({ ok: true });
});
