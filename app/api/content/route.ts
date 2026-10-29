import { db } from "@/lib/db";
import { detachMedia, removeDetachedMedia } from "@/lib/attachmentCleanup";
import { featureApi } from "@/lib/featureApi";
import { contentItems, saveContent } from "@/lib/calendarStore";
import { can } from "@/lib/permissions";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const GET = featureApi("content", "view", async (request, user) =>
  Response.json({
    events: contentItems(db),
    products: can(user, "products")
      ? db
          .prepare("SELECT id,name FROM products WHERE archived_at IS NULL")
          .all()
      : [],
    users: db
      .prepare(
        "SELECT u.id,u.name FROM user u JOIN organization_memberships m ON m.user_id=u.id WHERE m.organization_id=1 AND m.status='Active'",
      )
      .all(),
  }),
);
export const POST = featureApi("content", "create", async (request, user) =>
  Response.json({ id: saveContent(db, user, await request.json()) }),
);
export const PATCH = featureApi("content", "edit", async (request, user) =>
  Response.json({ id: saveContent(db, user, await request.json()) }),
);
export const DELETE = featureApi("content", "delete", async (request) => {
  const p = z
    .object({ id: z.number().int().positive(), confirm: z.literal(true) })
    .parse(await request.json());
  let keys: string[] = [];
  db.transaction(() => {
    db.prepare("DELETE FROM content_products WHERE content_id=?").run(p.id);
    if (
      !db
        .prepare("DELETE FROM content_entries WHERE id=? AND organization_id=1")
        .run(p.id).changes
    )
      throw Error("Content not found.");
    keys = detachMedia(db, "content", p.id);
  }).immediate();
  await removeDetachedMedia(keys);
  return Response.json({ ok: true });
});
