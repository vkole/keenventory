import type Database from "better-sqlite3";
import { z } from "zod";
import { instant, parseInstant } from "./calendarDates";
import { can, type Viewer } from "./permissions";
import { requirePermission } from "./access";
export type CalendarItem = {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  timezone: string;
  status: string;
  description: string;
  notes: string;
  record_type: string | null;
  record_id: number | null;
  url?: string;
  platform?: string;
  content_type?: string;
  campaign?: string;
  assigned_user?: string;
  hashtags?: string;
  external_link?: string;
  product_ids?: number[];
  record_feature?: string;
  all_day?: boolean;
  source_date?: string;
};
export function recordFeature(db: Database.Database, type: string, id: number) {
  if (type === "material") {
    const row = db
      .prepare(
        "SELECT name,category FROM materials WHERE id=? AND organization_id=1",
      )
      .get(id) as { name: string; category: string } | undefined;
    return /component|jar|lid|wick|label|packaging|box/i.test(
      (row?.category ?? "") + " " + (row?.name ?? ""),
    )
      ? "components"
      : "materials";
  }
  return linkedTypes[type as keyof typeof linkedTypes]?.feature;
}
export const linkedTypes = {
  product: { table: "products", feature: "products", date: "updated_at" },
  material: { table: "materials", feature: "materials", date: "updated_at" },
  order: { table: "sales_orders", feature: "orders", date: "scheduled_at" },
  purchase: {
    table: "purchase_orders",
    feature: "purchases",
    date: "scheduled_at",
  },
  manufacturing: {
    table: "manufacturing_batches",
    feature: "manufacturing",
    date: "scheduled_at",
  },
  stocktake: {
    table: "stocktakes",
    feature: "stocktakes",
    date: "scheduled_at",
  },
} as const;
export const platforms = [
  "Instagram",
  "TikTok",
  "Facebook",
  "Pinterest",
  "YouTube",
  "Website",
  "Email Marketing",
  "Other",
] as const;
export const contentTypes = [
  "Photo",
  "Reel",
  "Video",
  "Story",
  "Carousel",
  "Blog",
  "Email",
  "Promotion",
] as const;
export const contentStatuses = [
  "Idea",
  "Draft",
  "In Progress",
  "Ready",
  "Scheduled",
  "Published",
  "Cancelled",
] as const;
const base = {
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(250),
  date: z.string(),
  time: z.string(),
  timezone: z.string(),
  status: z.string().max(50),
  description: z.string().max(20000).default(""),
  notes: z.string().max(20000).default(""),
};
export function calendarItems(db: Database.Database, user: Viewer) {
  const stored = db
    .prepare("SELECT * FROM calendar_events WHERE organization_id=1")
    .all() as (Omit<CalendarItem, "id"> & { id: number; hidden: number })[];
  const output: CalendarItem[] = stored
    .filter(
      (e) =>
        !e.hidden &&
        (!e.record_type ||
          can(user, recordFeature(db, e.record_type, e.record_id!)!)),
    )
    .map((e) => ({ ...e, id: "event:" + e.id }));
  for (const [type, config] of Object.entries(linkedTypes)) {
    if (
      !can(user, config.feature) &&
      !(type === "material" && can(user, "components"))
    )
      continue;
    const rows = db
      .prepare(`SELECT * FROM ${config.table} WHERE organization_id=1`)
      .all() as Record<string, unknown>[];
    for (const row of rows) {
      if (stored.some((e) => e.record_type === type && e.record_id === row.id))
        continue;
      if (
        type === "material" &&
        !can(
          user,
          /component|jar|lid|wick|label|packaging|box/i.test(
            String(row.category) + " " + row.name,
          )
            ? "components"
            : "materials",
        )
      )
        continue;
      const date = String(
        row[config.date] ?? row.order_date ?? row.created_at ?? row.updated_at,
      );
      if (!Number.isFinite(parseInstant(date).getTime())) continue;
      output.push({
        id: type + ":" + row.id,
        title: String(row.name ?? row.order_number ?? `${type} #${row.id}`),
        event_type: type,
        starts_at: parseInstant(date).toISOString(),
        all_day: /^\d{4}-\d{2}-\d{2}$/.test(date),
        source_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
        timezone: "UTC",
        status: String(row.status ?? row.state ?? "Active"),
        description: String(row.description ?? ""),
        notes: String(row.notes ?? ""),
        record_type: type,
        record_id: Number(row.id),
      });
    }
  }
  return output.map((e) => ({
    ...e,
    record_feature: e.record_type
      ? recordFeature(db, e.record_type, e.record_id!)
      : undefined,
    url: e.record_type
      ? `/?module=${recordFeature(db, e.record_type, e.record_id!)}&record=${e.record_id}`
      : undefined,
  }));
}
export function saveCalendar(
  db: Database.Database,
  user: Viewer,
  input: unknown,
) {
  const p = z
    .object({
      ...base,
      event_type: z.string().min(1).max(80).default("Task"),
      record_type: z
        .enum([
          "product",
          "material",
          "order",
          "purchase",
          "manufacturing",
          "stocktake",
        ])
        .nullable()
        .default(null),
      record_id: z.number().int().positive().nullable().default(null),
    })
    .parse(input);
  const starts = instant(p.date, p.time, p.timezone);
  return db
    .transaction(() => {
      requirePermission(user, "calendar", p.id ? "edit" : "create");
      if (p.id) {
        const old = db
          .prepare(
            "SELECT record_type,record_id FROM calendar_events WHERE id=? AND organization_id=1",
          )
          .get(p.id) as
          { record_type: string | null; record_id: number | null } | undefined;
        if (!old) throw Error("Event not found.");
        if (old.record_type !== p.record_type || old.record_id !== p.record_id)
          throw Error(
            "An existing event cannot be moved to another source record.",
          );
      }
      if (!!p.record_type !== !!p.record_id)
        throw Error("Choose both the record type and original record.");
      if (p.record_type) {
        const c = linkedTypes[p.record_type];
        requirePermission(
          user,
          recordFeature(db, p.record_type, p.record_id!)!,
          "edit",
        );
        if (
          !db
            .prepare(
              `SELECT id FROM ${c.table} WHERE id=? AND organization_id=1`,
            )
            .get(p.record_id)
        )
          throw Error("Original record not found.");
        if (
          ["order", "purchase", "manufacturing", "stocktake"].includes(
            p.record_type,
          )
        )
          db.prepare(`UPDATE ${c.table} SET ${c.date}=? WHERE id=?`).run(
            starts,
            p.record_id,
          );
      }
      const values = [
        p.title,
        p.event_type,
        starts,
        p.timezone,
        p.status,
        p.description,
        p.notes,
        p.record_type,
        p.record_id,
      ];
      let id = p.id;
      if (id)
        db.prepare(
          "UPDATE calendar_events SET title=?,event_type=?,starts_at=?,timezone=?,status=?,description=?,notes=?,record_type=?,record_id=?,hidden=0,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(...values, id);
      else {
        const previous = p.record_id
          ? (db
              .prepare(
                "SELECT id FROM calendar_events WHERE record_type=? AND record_id=?",
              )
              .get(p.record_type, p.record_id) as { id: number } | undefined)
          : undefined;
        if (previous) {
          id = previous.id;
          db.prepare(
            "UPDATE calendar_events SET title=?,event_type=?,starts_at=?,timezone=?,status=?,description=?,notes=?,record_type=?,record_id=?,hidden=0,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          ).run(...values, id);
        } else
          id = Number(
            db
              .prepare(
                "INSERT INTO calendar_events(title,event_type,starts_at,timezone,status,description,notes,record_type,record_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)",
              )
              .run(...values, user.id).lastInsertRowid,
          );
      }
      return id;
    })
    .immediate();
}
export function deleteCalendar(
  db: Database.Database,
  user: Viewer,
  key: string,
) {
  return db
    .transaction(() => {
      requirePermission(user, "calendar", "delete");
      const item = calendarItems(db, user).find((e) => e.id === key);
      if (!item) throw Error("Event not found.");
      if (item.record_type) {
        requirePermission(
          user,
          recordFeature(db, item.record_type, item.record_id!)!,
          "edit",
        );
        db.prepare(
          "INSERT INTO calendar_events(title,event_type,starts_at,timezone,status,record_type,record_id,hidden,created_by) VALUES(?,?,?,?,?,?,?,1,?) ON CONFLICT(record_type,record_id) WHERE record_id IS NOT NULL DO UPDATE SET hidden=1",
        ).run(
          item.title,
          item.event_type,
          item.starts_at,
          item.timezone,
          item.status,
          item.record_type,
          item.record_id,
          user.id,
        );
      } else
        db.prepare("DELETE FROM calendar_events WHERE id=?").run(
          Number(key.split(":")[1]),
        );
    })
    .immediate();
}
export function contentItems(db: Database.Database): CalendarItem[] {
  return (
    db
      .prepare(
        "SELECT * FROM content_entries WHERE organization_id=1 ORDER BY scheduled_at",
      )
      .all() as Record<string, unknown>[]
  ).map(
    (r) =>
      ({
        ...r,
        id: "content:" + r.id,
        event_type: "Content",
        starts_at: r.scheduled_at,
        record_type: null,
        record_id: null,
        product_ids: (
          db
            .prepare(
              "SELECT product_id FROM content_products WHERE content_id=?",
            )
            .all(r.id) as { product_id: number }[]
        ).map((p) => p.product_id),
      }) as CalendarItem,
  );
}
export function saveContent(
  db: Database.Database,
  user: Viewer,
  input: unknown,
) {
  const p = z
    .object({
      ...base,
      platform: z.enum(platforms),
      copy_from: z.number().int().positive().optional(),
      content_type: z.enum(contentTypes),
      status: z.enum(contentStatuses),
      hashtags: z.string().max(5000).default(""),
      campaign: z.string().max(250).default(""),
      assigned_user: z.string().nullable().default(null),
      external_link: z
        .union([
          z.literal(""),
          z.url().refine((u) => u.startsWith("https://"), "Use an HTTPS link."),
        ])
        .default(""),
      product_ids: z.array(z.number().int().positive()).max(100).default([]),
    })
    .parse(input);
  const starts = instant(p.date, p.time, p.timezone);
  return db
    .transaction(() => {
      requirePermission(user, "content", p.id ? "edit" : "create");
      if (
        p.id &&
        !db
          .prepare(
            "SELECT id FROM content_entries WHERE id=? AND organization_id=1",
          )
          .get(p.id)
      )
        throw Error("Content not found.");
      if (
        p.assigned_user &&
        !db
          .prepare(
            "SELECT user_id FROM organization_memberships WHERE user_id=? AND organization_id=1 AND status='Active'",
          )
          .get(p.assigned_user)
      )
        throw Error("Choose an active team member.");
      for (const id of p.product_ids) {
        requirePermission(user, "products");
        if (
          !db
            .prepare("SELECT id FROM products WHERE id=? AND organization_id=1")
            .get(id)
        )
          throw Error("Associated product not found.");
      }
      const values = [
        p.title,
        p.platform,
        p.content_type,
        starts,
        p.timezone,
        p.status,
        p.description,
        p.hashtags,
        p.campaign,
        p.assigned_user,
        p.notes,
        p.external_link,
      ];
      let id = p.id;
      if (id)
        db.prepare(
          "UPDATE content_entries SET title=?,platform=?,content_type=?,scheduled_at=?,timezone=?,status=?,description=?,hashtags=?,campaign=?,assigned_user=?,notes=?,external_link=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(...values, id);
      else
        id = Number(
          db
            .prepare(
              "INSERT INTO content_entries(title,platform,content_type,scheduled_at,timezone,status,description,hashtags,campaign,assigned_user,notes,external_link,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
            .run(...values, user.id).lastInsertRowid,
        );
      db.prepare("DELETE FROM content_products WHERE content_id=?").run(id);
      for (const product of new Set(p.product_ids))
        db.prepare("INSERT INTO content_products VALUES(?,?)").run(id, product);
      if (!p.id && p.copy_from) {
        requirePermission(user, "content");
        if (
          !db
            .prepare(
              "SELECT id FROM content_entries WHERE id=? AND organization_id=1",
            )
            .get(p.copy_from)
        )
          throw Error("Original content not found.");
        db.prepare(
          "INSERT INTO attachments(owner_type,owner_id,object_key,filename,content_type,size,is_primary,created_by) SELECT 'content',?,object_key,filename,content_type,size,is_primary,? FROM attachments WHERE owner_type='content' AND owner_id=?",
        ).run(id, user.id, p.copy_from);
      }
      return id;
    })
    .immediate();
}
