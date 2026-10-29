import { db } from "@/lib/db";
import { featureApi } from "@/lib/featureApi";
import {
  calendarItems,
  saveCalendar,
  deleteCalendar,
} from "@/lib/calendarStore";
import { can } from "@/lib/permissions";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const GET = featureApi("calendar", "view", async (request, user) =>
  Response.json({
    events: calendarItems(db, user),
    products: can(user, "products")
      ? db
          .prepare("SELECT id,name FROM products WHERE archived_at IS NULL")
          .all()
      : [],
  }),
);
export const POST = featureApi("calendar", "create", async (request, user) =>
  Response.json({ id: saveCalendar(db, user, await request.json()) }),
);
export const PATCH = featureApi("calendar", "edit", async (request, user) =>
  Response.json({ id: saveCalendar(db, user, await request.json()) }),
);
export const DELETE = featureApi(
  "calendar",
  "delete",
  async (request, user) => {
    const p = z
      .object({ id: z.string(), confirm: z.literal(true) })
      .parse(await request.json());
    deleteCalendar(db, user, p.id);
    return Response.json({ ok: true });
  },
);
