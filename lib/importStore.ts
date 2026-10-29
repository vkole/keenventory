import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { z } from "zod";
import { productSchema, saveProduct, product, moveStock } from "./productStore";
import { requirePermission } from "./access";
import type { Viewer } from "./permissions";
import { money, decimal } from "./production";
import type { ImportRow } from "./importFiles";
import { instant, dateInZone } from "./calendarDates";
export type PreviewRow = {
  row: number;
  data: ImportRow;
  errors: string[];
  match_id: number | null;
  action: string;
};
export function importPreview(
  db: Database.Database,
  kind: string,
  rows: ImportRow[],
  mode: string,
  user: Viewer,
  opening: boolean,
  zone: string,
) {
  if (!rows.length || rows.length > 5000) throw Error("Import 1–5,000 rows.");
  rows = rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v.trim()])),
  );
  if (kind === "orders") {
    const headerFields = [
      "Order Date",
      "Customer Name",
      "Customer Email",
      "Shipping",
      "Tax",
      "Order Total",
      "Payment Status",
      "Fulfillment Status",
      "Notes",
    ];
    const groups = new Map<string, ImportRow[]>();
    for (const row of rows) {
      if (row._action === "skip") continue;
      const key =
        (row["Sales Channel"] ?? "").toLowerCase() +
        "\0" +
        (row["Order Number"] ?? "").toLowerCase();
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const group of groups.values())
      for (const field of headerFields) {
        const value = group.find((r) => r[field])?.[field];
        if (value) for (const row of group) if (!row[field]) row[field] = value;
      }
  }
  const seen = new Set<string>();
  const demands = new Map<number, number>();
  const output: PreviewRow[] = rows.map((data, index) => {
    const errors: string[] = [];
    let match_id: number | null = null;
    let action = data._action || "create";
    if (kind === "products") {
      const sku = (data.SKU ?? "").trim(),
        match = db
          .prepare(
            "SELECT id,name,archived_at FROM products WHERE sku=? COLLATE NOCASE",
          )
          .get(sku) as
          { id: number; name: string; archived_at: string | null } | undefined;
      match_id = match?.id ?? null;
      action =
        data._action ||
        (match ? (mode === "update" ? "update" : "skip") : "create");
      if (action === "update") requirePermission(user, "products", "edit");
      if (action !== "skip") {
        const values: Record<string, unknown> = {
          name: data["Product Name"] || match?.name,
          sku,
          retail_price: data["Retail Price"] || 0,
          cost_per_unit: data["Cost Price"] || 0,
          stock_quantity: data["Stock Quantity"] || 0,
          reorder_threshold: data["Reorder Level"] || 0,
          state: data["Product Status"] || "Active",
        };
        const checked = productSchema.safeParse(values);
        if (!checked.success)
          errors.push(
            ...checked.error.issues.map(
              (i) => i.path.join(".") + ": " + i.message,
            ),
          );
        if (data["Retail Price"] !== undefined && data["Retail Price"] !== "")
          requirePermission(user, "productPricing", "edit");
        if (data["Cost Price"] !== undefined && data["Cost Price"] !== "")
          requirePermission(user, "materialCosts", "edit");
        if (match?.archived_at)
          errors.push("Restore the archived product before updating.");
        if (match && action === "create")
          errors.push("SKU already exists. Choose Update or Skip.");
        if (!match && action === "update")
          errors.push("No matching product exists to update.");
        if (seen.has(sku.toLowerCase()))
          errors.push("Duplicate SKU in this import.");
        seen.add(sku.toLowerCase());
        if (
          data["Product Image URL"] &&
          !z
            .url()
            .refine((u) => u.startsWith("https://"))
            .safeParse(data["Product Image URL"]).success
        )
          errors.push("Product Image URL must use HTTPS.");
      }
    } else {
      const number = (data["Order Number"] ?? "").trim(),
        channel = (data["Sales Channel"] ?? "").trim();
      const match = db
        .prepare(
          "SELECT id FROM sales_orders WHERE order_number=? COLLATE NOCASE AND channel=? COLLATE NOCASE",
        )
        .get(number, channel) as { id: number } | undefined;
      match_id = match?.id ?? null;
      action = data._action || (match ? "skip" : "create");
      if (action !== "skip") {
        if (match)
          errors.push(
            "This channel/order number already exists. Skip it to avoid duplicate inventory deductions.",
          );
        if (!number || !channel)
          errors.push("Order Number and Sales Channel are required.");
        if (!data["Customer Name"]?.trim())
          errors.push("Customer Name is required.");
        if (
          data["Customer Email"] &&
          !z.email().safeParse(data["Customer Email"]).success
        )
          errors.push("Customer Email is invalid.");
        try {
          instant(data["Order Date"], "00:00", zone);
        } catch {
          errors.push("Order Date must be YYYY-MM-DD.");
        }
        const sku = (data["Product SKU"] ?? "").trim(),
          p = db
            .prepare(
              "SELECT * FROM products WHERE sku=? COLLATE NOCASE AND archived_at IS NULL",
            )
            .get(sku) as { id: number; stock_quantity: number } | undefined;
        if (!p) errors.push("Match this row to an active Product SKU.");
        for (const key of ["Quantity", "Unit Price"])
          if (
            data[key] === undefined ||
            data[key] === "" ||
            !Number.isFinite(Number(data[key])) ||
            Number(data[key]) < (key === "Quantity" ? 0.000001 : 0) ||
            Number(data[key]) > 1e9
          )
            errors.push(
              key +
                " must be a valid " +
                (key === "Quantity" ? "positive" : "nonnegative") +
                " number.",
            );
        for (const key of ["Discount", "Shipping", "Tax", "Order Total"])
          if (
            data[key] &&
            (!Number.isFinite(Number(data[key])) ||
              Number(data[key]) < 0 ||
              Number(data[key]) > 1e9)
          )
            errors.push(key + " must be a nonnegative number.");
        if (
          Number(data.Discount || 0) >
          Number(data.Quantity) * Number(data["Unit Price"])
        )
          errors.push("Discount exceeds the line subtotal.");
        const status = data["Fulfillment Status"] || "Pending",
          payment = data["Payment Status"] || "Unpaid";
        if (!["Draft", "Pending", "Fulfilled", "Cancelled"].includes(status))
          errors.push("Choose Draft, Pending, Fulfilled, or Cancelled.");
        if (!["Unpaid", "Paid", "Partially Paid", "Refunded"].includes(payment))
          errors.push("Choose a valid Payment Status.");
        if (
          status === "Fulfilled" &&
          !["Paid", "Partially Paid"].includes(payment)
        )
          errors.push(
            "Fulfilled imports require a qualifying payment status. Review this order before importing.",
          );
        if (p && ["Pending", "Fulfilled"].includes(status))
          demands.set(
            p.id,
            (demands.get(p.id) ?? 0) + Number(data.Quantity || 0),
          );
      }
    }
    if (
      !["skip", "create", ...(kind === "products" ? ["update"] : [])].includes(
        action,
      )
    )
      errors.push("Invalid row action.");
    return { row: index + 2, data, errors, match_id, action };
  });
  if (kind === "orders") {
    for (const row of output.filter((r) => r.action !== "skip")) {
      const group = output.filter(
        (r) =>
          r.action !== "skip" &&
          r.data["Order Number"]?.trim().toLowerCase() ===
            row.data["Order Number"]?.trim().toLowerCase() &&
          r.data["Sales Channel"]?.trim().toLowerCase() ===
            row.data["Sales Channel"]?.trim().toLowerCase(),
      );
      for (const field of [
        "Order Date",
        "Customer Name",
        "Customer Email",
        "Shipping",
        "Tax",
        "Order Total",
        "Payment Status",
        "Fulfillment Status",
      ]) {
        const values = new Set(
          group.map((r) => r.data[field] ?? "").filter(Boolean),
        );
        if (values.size > 1)
          row.errors.push(field + " differs between lines of the same order.");
      }
      const first = group[0].data,
        expected = money(
          group.reduce(
            (sum, r) =>
              sum +
              Number(r.data.Quantity) * Number(r.data["Unit Price"]) -
              Number(r.data.Discount || 0),
            0,
          ) +
            Number(first.Shipping || 0) +
            Number(first.Tax || 0),
        );
      if (
        first["Order Total"] &&
        Math.abs(expected - Number(first["Order Total"])) > 0.01
      )
        row.errors.push(
          "Order Total does not match lines, discounts, shipping, and tax.",
        );
      const p = db
        .prepare("SELECT id FROM products WHERE sku=? COLLATE NOCASE")
        .get(row.data["Product SKU"] ?? "") as { id: number } | undefined;
      if (
        p &&
        ["Pending", "Fulfilled"].includes(
          row.data["Fulfillment Status"] || "Pending",
        ) &&
        product(db, p.id).locations?.find(
          (l) => l.location === product(db, p.id).location,
        )?.available! < (demands.get(p.id) ?? 0)
      )
        row.errors.push(
          "Insufficient available stock for the combined imported orders.",
        );
    }
  }
  const hash = createHash("sha256")
    .update(JSON.stringify({ kind, rows: output, mode, opening, zone }))
    .digest("hex");
  return {
    rows: output,
    hash,
    failed: output.filter((r) => r.errors.length).length,
  };
}
export function commitImport(
  db: Database.Database,
  user: Viewer,
  jobId: string,
  preview: ReturnType<typeof importPreview>,
  opening: boolean,
  zone: string,
) {
  return db
    .transaction(() => {
      const job = db
        .prepare("SELECT * FROM import_jobs WHERE id=? AND organization_id=1")
        .get(jobId) as {
        kind: string;
        status: string;
        result: string;
        created_by: string;
      };
      if (job.status === "Completed") return JSON.parse(job.result);
      if (preview.failed)
        throw Error("Correct validation errors before importing.");
      let created = 0,
        updated = 0,
        skipped = 0;
      if (job.kind === "products")
        for (const row of preview.rows) {
          if (row.action === "skip") {
            skipped++;
            continue;
          }
          const d = row.data,
            old = row.match_id ? product(db, row.match_id) : null;
          const value: Record<string, unknown> = old
            ? {
                ...old,
                attributes: JSON.parse(old.attributes),
                auto_manufacture: !!old.auto_manufacture,
              }
            : {};
          const map: Record<string, string> = {
            "Product Name": "name",
            SKU: "sku",
            Description: "description",
            Category: "category",
            "Retail Price": "retail_price",
            "Cost Price": "cost_per_unit",
            "Reorder Level": "reorder_threshold",
            "Product Status": "state",
          };
          for (const [column, key] of Object.entries(map))
            if (d[column] !== undefined && d[column] !== "")
              value[key] = key === "sku" && old ? old.sku : d[column];
          value.stock_quantity = old
            ? 0
            : opening
              ? Number(d["Stock Quantity"] || 0)
              : 0;
          const id = saveProduct(db, value);
          const extras: Record<string, string> = {
            "Product Type": "product_type",
            Variant: "variant",
            Size: "size",
            Scent: "scent",
            Supplier: "supplier",
            "Product Image URL": "image_url",
          };
          for (const [column, key] of Object.entries(extras))
            if (d[column] !== undefined)
              db.prepare(`UPDATE products SET ${key}=? WHERE id=?`).run(
                d[column],
                id,
              );
          db.prepare(
            "INSERT OR IGNORE INTO imported_documents VALUES(?,?,?)",
          ).run(jobId, "product", id);
          old ? updated++ : created++;
        }
      else {
        const groups = new Map<string, PreviewRow[]>();
        for (const row of preview.rows) {
          if (row.action === "skip") {
            skipped++;
            continue;
          }
          const key =
            row.data["Sales Channel"].trim().toLowerCase() +
            "\0" +
            row.data["Order Number"].trim().toLowerCase();
          groups.set(key, [...(groups.get(key) ?? []), row]);
        }
        for (const rows of groups.values()) {
          const first = rows[0].data,
            status = first["Fulfillment Status"] || "Pending",
            payment = first["Payment Status"] || "Unpaid";
          const total = money(
            rows.reduce(
              (s, r) =>
                s +
                Number(r.data.Quantity) * Number(r.data["Unit Price"]) -
                Number(r.data.Discount || 0),
              0,
            ) +
              Number(first.Shipping || 0) +
              Number(first.Tax || 0),
          );
          const order = Number(
            db
              .prepare(
                "INSERT INTO sales_orders(customer,status,total,channel,order_number,order_date,customer_email,payment_status,shipping,tax,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
              )
              .run(
                first["Customer Name"],
                status,
                total,
                first["Sales Channel"],
                first["Order Number"],
                instant(first["Order Date"], "00:00", zone),
                first["Customer Email"] || "",
                payment,
                Number(first.Shipping || 0),
                Number(first.Tax || 0),
                first.Notes || "",
              ).lastInsertRowid,
          );
          for (const row of rows) {
            const d = row.data,
              pid = (
                db
                  .prepare("SELECT id FROM products WHERE sku=? COLLATE NOCASE")
                  .get(d["Product SKU"]) as { id: number }
              ).id,
              p = product(db, pid);
            const qualifies = status === "Fulfilled";
            const cost =
              first["Order Date"] === dateInZone(new Date(), zone)
                ? p.cost_per_unit
                : null;
            const line = Number(
              db
                .prepare(
                  "INSERT INTO sales_order_lines(order_id,product_id,quantity,unit_price,location,fulfilled,discount,cost_at_sale) VALUES(?,?,?,?,?,?,?,?)",
                )
                .run(
                  order,
                  pid,
                  Number(d.Quantity),
                  Number(d["Unit Price"]),
                  p.location,
                  qualifies ? 1 : 0,
                  Number(d.Discount || 0),
                  qualifies ? cost : null,
                ).lastInsertRowid,
            );
            if (qualifies)
              moveStock(db, {
                id: pid,
                location: p.location,
                delta: -Number(d.Quantity),
                kind: "Sale",
                reason: "Imported fulfilled order " + first["Order Number"],
                reference_type: "order",
                reference_id: order,
                request_key: "import:" + jobId + ":" + line,
              });
          }
          db.prepare("INSERT INTO imported_documents VALUES(?,?,?)").run(
            jobId,
            "order",
            order,
          );
          created++;
        }
      }
      const result = { created, updated, skipped, failed: 0 };
      db.prepare(
        "UPDATE import_jobs SET status='Completed',result=? WHERE id=?",
      ).run(JSON.stringify(result), jobId);
      return result;
    })
    .immediate();
}
