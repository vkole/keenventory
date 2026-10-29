import { db } from "@/lib/db";
import { featureApi } from "@/lib/featureApi";
import { requirePermission, redact } from "@/lib/access";
import { can } from "@/lib/permissions";
const records = {
  products: { table: "products", feature: "products" },
  materials: { table: "materials", feature: "materials" },
  components: { table: "materials", feature: "components" },
  orders: { table: "sales_orders", feature: "orders" },
  purchases: { table: "purchase_orders", feature: "purchases" },
  manufacturing: { table: "manufacturing_batches", feature: "manufacturing" },
  stocktakes: { table: "stocktakes", feature: "stocktakes" },
} as const;
export const GET = featureApi("dashboard", "view", async (request, user) => {
  const params = new URL(request.url).searchParams,
    type = params.get("type") as keyof typeof records,
    config = records[type];
  if (!config) throw Error("Choose a supported record.");
  requirePermission(user, config.feature);
  const id = Number(params.get("id")),
    record = db
      .prepare(`SELECT * FROM ${config.table} WHERE id=? AND organization_id=1`)
      .get(id) as Record<string, unknown> | undefined;
  if (!record) throw Error("Record not found.");
  if (["materials", "components"].includes(type)) {
    const component = /component|jar|lid|wick|label|packaging|box/i.test(
      record.category + " " + record.name,
    );
    requirePermission(user, component ? "components" : "materials");
  }
  const lines =
    type === "orders"
      ? db
          .prepare(
            "SELECT * FROM sales_order_lines WHERE order_id=? AND organization_id=1",
          )
          .all(id)
      : type === "purchases"
        ? db
            .prepare(
              "SELECT * FROM purchase_order_lines WHERE purchase_id=? AND organization_id=1",
            )
            .all(id)
        : [];
  const documents = ["orders", "products"].includes(type)
    ? db
        .prepare(
          "SELECT j.id,j.filename FROM import_jobs j JOIN imported_documents d ON d.job_id=j.id WHERE d.record_type=? AND d.record_id=? AND j.organization_id=1",
        )
        .all(type === "orders" ? "order" : "product", id)
    : [];
  return Response.json(redact({ record, lines, documents }, user));
});
