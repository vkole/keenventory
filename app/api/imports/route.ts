import { db } from "@/lib/db";
import { featureApi } from "@/lib/featureApi";
import { requirePermission, AccessError } from "@/lib/access";
import { parseImportFile } from "@/lib/importFiles";
import { importPreview, commitImport } from "@/lib/importStore";
import { randomUUID } from "node:crypto";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const GET = featureApi("dashboard", "view", async (request, user) => {
  const p = new URL(request.url).searchParams,
    kind = z.enum(["products", "orders"]).parse(p.get("kind") ?? "products");
  requirePermission(user, kind);
  if (p.has("download")) {
    const job = db
      .prepare(
        "SELECT filename,content_type,document,created_by FROM import_jobs WHERE id=? AND kind=? AND organization_id=1",
      )
      .get(p.get("download"), kind) as
      | {
          filename: string;
          content_type: string;
          document: Buffer;
          created_by: string;
        }
      | undefined;
    if (!job) throw Error("Document not found.");
    if (job.created_by !== user.id) {
      requirePermission(
        user,
        kind === "products" ? "materialCosts" : "orderTotals",
      );
      requirePermission(
        user,
        kind === "products" ? "productPricing" : "customers",
      );
    }
    return new Response(new Uint8Array(job.document), {
      headers: {
        "Content-Type": job.content_type,
        "Content-Disposition":
          "attachment; filename*=UTF-8''" + encodeURIComponent(job.filename),
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return Response.json({
    jobs: db
      .prepare(
        "SELECT j.id,j.filename,j.status,j.result,j.created_at,u.name importing_user FROM import_jobs j LEFT JOIN user u ON u.id=j.created_by WHERE j.kind=? AND j.organization_id=1 AND (j.created_by=? OR ?=1) ORDER BY j.created_at DESC LIMIT 100",
      )
      .all(kind, user.id, ["Owner", "Admin"].includes(user.role) ? 1 : 0),
  });
});
export const POST = featureApi("dashboard", "view", async (request, user) => {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    const data = await request.formData(),
      kind = z.enum(["products", "orders"]).parse(data.get("kind"));
    requirePermission(user, kind, "create");
    if (kind === "orders") {
      requirePermission(user, "orderTotals", "edit");
      requirePermission(user, "products");
    }
    const file = data.get("file");
    if (!(file instanceof File)) throw Error("Choose a document.");
    const parsed = await parseImportFile(file, kind),
      id = randomUUID();
    db.prepare(
      "INSERT INTO import_jobs(id,kind,filename,content_type,document,source_rows,extracted_text,created_by) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      id,
      kind,
      file.name.slice(0, 250),
      parsed.contentType,
      parsed.bytes,
      JSON.stringify(parsed.rows),
      parsed.text,
      user.id,
    );
    return Response.json({
      id,
      rows: parsed.rows,
      extracted_text: parsed.text,
      fields: Object.keys(parsed.rows[0] ?? {}),
    });
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > 8 * 1024 * 1024)
    throw Error("Review at most 8 MB of row data at a time.");
  const p = z
    .object({
      id: z.string().uuid(),
      rows: z.array(z.record(z.string(), z.string())).min(1).max(5000),
      mode: z.enum(["skip", "update", "create"]).default("skip"),
      opening: z.boolean().default(false),
      timezone: z.string(),
      confirm: z.boolean().default(false),
      preview_hash: z.string().optional(),
    })
    .parse(JSON.parse(text));
  const job = db
    .prepare("SELECT * FROM import_jobs WHERE id=? AND organization_id=1")
    .get(p.id) as
    | {
        kind: string;
        created_by: string;
        status: string;
        result: string;
        preview_hash: string;
      }
    | undefined;
  if (!job) throw Error("Import job not found.");
  if (job.created_by !== user.id)
    throw new AccessError("Only the uploading user may confirm this import.");
  requirePermission(user, job.kind, "create");
  if (job.kind === "orders") {
    requirePermission(user, "orderTotals", "edit");
    requirePermission(user, "products");
  }
  if (job.status === "Completed") return Response.json(JSON.parse(job.result));
  const preview = importPreview(
    db,
    job.kind,
    p.rows,
    p.mode,
    user,
    p.opening,
    p.timezone,
  );
  if (!p.confirm) {
    db.transaction(() => {
      db.prepare(
        "UPDATE import_jobs SET preview=?,preview_hash=?,status=? WHERE id=?",
      ).run(JSON.stringify(preview), preview.hash, "Previewed", p.id);
      db.prepare("DELETE FROM import_job_errors WHERE job_id=?").run(p.id);
      for (const row of preview.rows)
        for (const error of row.errors)
          db.prepare(
            "INSERT INTO import_job_errors(job_id,row_number,message) VALUES(?,?,?)",
          ).run(p.id, row.row, error);
    }).immediate();
    return Response.json(preview);
  }
  if (p.preview_hash !== job.preview_hash || p.preview_hash !== preview.hash)
    throw Error(
      "Rows, options, or matching records changed. Validate and preview again.",
    );
  return Response.json(
    commitImport(db, user, p.id, preview, p.opening, p.timezone),
  );
});
