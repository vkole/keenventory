import { recordFeature } from "@/lib/calendarStore";
import { db } from "@/lib/db";
import { featureApi } from "@/lib/featureApi";
import { requirePermission } from "@/lib/access";
import {
  readImage,
  storeMedia,
  deleteImage,
  imageStorageReady,
} from "@/lib/imageStorage";
import { z } from "zod";
import type { Viewer } from "@/lib/permissions";
export const dynamic = "force-dynamic";
const owners = {
  recipe: { table: "recipes", feature: "recipes" },
  content: { table: "content_entries", feature: "content" },
  calendar: { table: "calendar_events", feature: "calendar" },
} as const;
function owner(
  type: unknown,
  id: unknown,
  user: Viewer,
  action: "view" | "edit" = "view",
) {
  const kind = z.enum(["recipe", "content", "calendar"]).parse(type),
    n = z.coerce.number().int().positive().parse(id);
  requirePermission(user, owners[kind].feature, action);
  if (
    !db
      .prepare(
        `SELECT id FROM ${owners[kind].table} WHERE id=? AND organization_id=1`,
      )
      .get(n)
  )
    throw Error("Record not found.");
  if (kind === "calendar") {
    const event = db
      .prepare("SELECT record_type,record_id FROM calendar_events WHERE id=?")
      .get(n) as { record_type: string | null; record_id: number | null };
    if (event.record_type)
      requirePermission(
        user,
        recordFeature(db, event.record_type, event.record_id!)!,
        action,
      );
  }
  return { kind, id: n };
}
export const GET = featureApi("dashboard", "view", async (request, user) => {
  const p = new URL(request.url).searchParams;
  if (p.has("status"))
    return Response.json({ configured: imageStorageReady() });
  if (p.has("id")) {
    const row = db
      .prepare("SELECT * FROM attachments WHERE id=? AND organization_id=1")
      .get(Number(p.get("id"))) as
      | {
          owner_type: string;
          owner_id: number;
          object_key: string;
          content_type: string;
        }
      | undefined;
    if (!row) throw Error("Attachment not found.");
    owner(row.owner_type, row.owner_id, user);
    return new Response(await readImage(row.object_key), {
      headers: {
        "Content-Type": row.content_type,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const o = owner(p.get("owner_type"), p.get("owner_id"), user);
  return Response.json({
    attachments: db
      .prepare(
        "SELECT id,filename,content_type,size,is_primary FROM attachments WHERE owner_type=? AND owner_id=? ORDER BY is_primary DESC,id",
      )
      .all(o.kind, o.id),
  });
});
export const POST = featureApi("dashboard", "view", async (request, user) => {
  const data = await request.formData(),
    o = owner(data.get("owner_type"), data.get("owner_id"), user, "edit");
  const file = data.get("file");
  if (!(file instanceof File)) throw Error("Choose a file.");
  if (o.kind !== "content" && !file.type.startsWith("image/"))
    throw Error("Choose an image.");
  const stored = await storeMedia(file);
  try {
    const id = db
      .transaction(() => {
        owner(o.kind, o.id, user, "edit");
        const has = db
          .prepare(
            "SELECT id FROM attachments WHERE owner_type=? AND owner_id=?",
          )
          .get(o.kind, o.id);
        return Number(
          db
            .prepare(
              "INSERT INTO attachments(owner_type,owner_id,object_key,filename,content_type,size,is_primary,created_by) VALUES(?,?,?,?,?,?,?,?)",
            )
            .run(
              o.kind,
              o.id,
              stored.key,
              file.name.slice(0, 250),
              stored.type,
              file.size,
              has ? 0 : 1,
              user.id,
            ).lastInsertRowid,
        );
      })
      .immediate();
    return Response.json({ id });
  } catch (e) {
    await deleteImage(stored.key).catch(() => {});
    throw e;
  }
});
export const PATCH = featureApi("dashboard", "view", async (request, user) => {
  const p = await request.json(),
    o = owner(p.owner_type, p.owner_id, user, "edit");
  if (
    !db
      .prepare(
        "SELECT id FROM attachments WHERE id=? AND owner_type=? AND owner_id=?",
      )
      .get(p.id, o.kind, o.id)
  )
    throw Error("Attachment not found.");
  db.transaction(() => {
    db.prepare(
      "UPDATE attachments SET is_primary=0 WHERE owner_type=? AND owner_id=?",
    ).run(o.kind, o.id);
    db.prepare("UPDATE attachments SET is_primary=1 WHERE id=?").run(p.id);
  }).immediate();
  return Response.json({ ok: true });
});
export const DELETE = featureApi("dashboard", "view", async (request, user) => {
  const p = await request.json(),
    o = owner(p.owner_type, p.owner_id, user, "edit");
  if (p.confirm !== true) throw Error("Confirm removal.");
  const row = db
    .prepare(
      "SELECT object_key FROM attachments WHERE id=? AND owner_type=? AND owner_id=?",
    )
    .get(p.id, o.kind, o.id) as { object_key: string } | undefined;
  if (!row) throw Error("Attachment not found.");
  db.transaction(() => {
    db.prepare("DELETE FROM attachments WHERE id=?").run(p.id);
    if (
      !db
        .prepare(
          "SELECT id FROM attachments WHERE owner_type=? AND owner_id=? AND is_primary=1",
        )
        .get(o.kind, o.id)
    )
      db.prepare(
        "UPDATE attachments SET is_primary=1 WHERE id=(SELECT MIN(id) FROM attachments WHERE owner_type=? AND owner_id=?)",
      ).run(o.kind, o.id);
  }).immediate();
  if (
    !db
      .prepare("SELECT id FROM attachments WHERE object_key=?")
      .get(row.object_key)
  )
    await deleteImage(row.object_key).catch(() => {});
  return Response.json({ ok: true });
});
