import { NextResponse } from "next/server";
import { authentication } from "./auth";
import { db } from "./db";
import { appURL } from "./email";
import { can, type Viewer, type Action } from "./permissions";
export class AccessError extends Error {
  constructor(
    message: string,
    public status = 403,
  ) {
    super(message);
  }
}
export function audit(
  user: Pick<Viewer, "id"> | null,
  action: string,
  record: string,
  success: boolean,
  details: unknown = {},
) {
  db.prepare(
    "INSERT INTO audit_logs(organization_id,user_id,action,record,details,success) VALUES(1,?,?,?,?,?)",
  ).run(
    user?.id ?? null,
    action,
    record,
    JSON.stringify(details),
    success ? 1 : 0,
  );
}
export function sameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (request.headers.get("origin") !== appURL())
    throw new AccessError("Request origin is not allowed.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AccessError("Cross-site request rejected.");
}
export async function viewer(headers: Headers): Promise<Viewer | null> {
  const auth = await authentication();
  const session = await auth.api.getSession({ headers });
  if (!session || !session.user.emailVerified) return null;
  const membership = db
    .prepare(
      "SELECT * FROM organization_memberships WHERE user_id=? AND organization_id=1 AND status='Active'",
    )
    .get(session.user.id) as
    { role: Viewer["role"]; permissions: string } | undefined;
  if (!membership) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    organization_id: 1,
    role: membership.role,
    permissions: JSON.parse(membership.permissions),
  };
}
export function requirePermission(
  user: Viewer,
  feature: string,
  action: Action = "view",
) {
  if (feature === "dashboard" && action === "view") return;
  if (!can(user, feature, action))
    throw new AccessError("You do not have permission for this action.");
}
export function redact(value: unknown, user: Viewer): unknown {
  if (Array.isArray(value)) return value.map((v) => redact(v, user));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const k = key.toLowerCase();
    if (key === "materials" && Array.isArray(v)) {
      output[key] = v
        .filter((r) =>
          can(
            user,
            /component|jar|lid|wick|label|packaging|box/i.test(
              String(r.category) + " " + String(r.name),
            )
              ? "components"
              : "materials",
          ),
        )
        .map((r) => redact(r, user));
      continue;
    }
    const linked: Record<string, string> = {
      orders: "orders",
      purchases: "purchases",
      manufactures: "manufacturing",
      recipes: "recipes",
      stocktakes: "stocktakes",
      ledger: "adjustments",
      events: "products",
      listings: "integrations",
      pushes: "stockPush",
    };
    if (linked[key] && !can(user, linked[key])) {
      output[key] = [];
      continue;
    }
    if (/profit|margin|markup|guidance/.test(k) && !can(user, "profitability"))
      continue;
    if (
      /cost|labor|overhead|hourly|inventoryvalue|materialvalue|goodsvalue/.test(
        k,
      ) &&
      !can(user, "materialCosts") &&
      !(k === "total_cost" && can(user, "orderTotals"))
    )
      continue;
    if (/price|retail|wholesale/.test(k) && !can(user, "productPricing"))
      continue;
    if (
      /^(total|total_cost|sales|revenue|onlinesales|avgordervalue)$/.test(k) &&
      !can(user, "orderTotals")
    )
      continue;
    if (["customer","customer_email"].includes(k) && !can(user, "customers")) continue;
    if (
      [
        "recipe_snapshot",
        "details",
        "consumption",
        "mapping_snapshot",
        "result",
      ].includes(k) &&
      typeof v === "string"
    ) {
      try {
        output[key] = JSON.stringify(redact(JSON.parse(v), user));
      } catch {
        if (
          can(user, "materialCosts") &&
          can(user, "productPricing") &&
          can(user, "orderTotals")
        )
          output[key] = v;
      }
    } else output[key] = redact(v, user);
  }
  return output;
}
export function dashboardFor<T>(data: T, user: Viewer): T {
  const result = redact(data, user) as Record<string, unknown>;
  const sections: Record<string, string> = {
    materials: "materials",
    products: "products",
    recipes: "recipes",
    manufacturingBatches: "manufacturing",
    salesOrders: "orders",
    purchaseOrders: "purchases",
    suppliers: "vendors",
    adjustments: "adjustments",
    stocktakes: "stocktakes",
  };
  for (const [section, feature] of Object.entries(sections))
    if (
      !can(user, feature) &&
      !(section === "materials" && can(user, "components"))
    )
      result[section] = [];
  if (!can(user, "reporting"))
    result.chartData = {
      sales: [],
      inventory: [],
      materialUsage: [],
      batches: [],
    };
  else if (result.chartData && typeof result.chartData === "object") {
    const charts = result.chartData as Record<string, unknown>;
    if (!can(user, "materialCosts")) charts.inventory = [];
    if (!can(user, "orderTotals")) charts.sales = [];
  }
  // Aggregate statistics can reveal data in modules a user cannot view.
  if (!Object.values(sections).every((f) => can(user, f))) result.summary = {};
  return result as T;
}
type Handler = (request: Request) => Promise<Response>;
const actionRules: Record<string, [string, Action]> = {
  attributes: ["products", "edit"],
  archive: ["products", "delete"],
  restore: ["products", "edit"],
  delete: ["products", "delete"],
  copy: ["products", "create"],
  transfer: ["transfers", "create"],
  adjust: ["adjustments", "create"],
  stocktake: ["stocktakes", "create"],
  order: ["orders", "create"],
  purchase: ["purchases", "create"],
  fulfill: ["orders", "approve"],
  receive: ["purchases", "approve"],
  componentize: ["components", "create"],
  merge: ["products", "delete"],
};
export function secured(feature: string, handler: Handler): Handler {
  return async (request) => {
    let user: Viewer | null = null;
    const url = new URL(request.url);
    const mutating = !["GET", "HEAD"].includes(request.method);
    try {
      sameOrigin(request);
      user = await viewer(request.headers);
      if (!user) throw new AccessError("Authentication required.", 401);
      let action: Action = mutating
        ? request.method === "POST"
          ? "create"
          : request.method === "DELETE"
            ? "delete"
            : "edit"
        : "view";
      let f = feature;
      let body: Record<string, unknown> = {};
      if (mutating) {
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.includes("application/json"))
          body = await request.clone().json();
        else if (!(
          url.pathname === "/api/products/images" &&
          request.method === "POST" &&
          contentType.includes("multipart/form-data")
        ))
          throw new AccessError("Use an application/json request.", 415);
      }
      if (url.pathname === "/api/materials") {
        if (mutating)
          f = /component|jar|lid|wick|label|packaging|box/i.test(
            String(body.category) + " " + String(body.name),
          )
            ? "components"
            : "materials";
        else if (!can(user, "materials") && can(user, "components"))
          f = "components";
      }
      if (url.pathname === "/api/products/actions") {
        const rule = actionRules[String(body.action)];
        if (!rule) throw new AccessError("Unsupported action.");
        [f, action] = rule;
        if (body.action === "componentize")
          requirePermission(user, "products", "edit");
      }
      if (url.pathname === "/api/products/bulk")
        action = body.action === "archive" ? "delete" : "edit";
      if (url.pathname === "/api/products" && body.id) action = "edit";
      if (url.pathname === "/api/recipes" && body.id) action = "edit";
      if (url.pathname === "/api/manufacturing" && request.method === "PATCH")
        action = "approve";
      if (url.pathname === "/api/products/images" && mutating) action = "edit";
      if (url.pathname === "/api/products/import" && mutating) {
        requirePermission(user, "products", "create");
        requirePermission(user, "products", "edit");
        requirePermission(user, "materialCosts", "edit");
        requirePermission(user, "productPricing", "edit");
      }
      if (url.pathname === "/api/products/shopify" && mutating) {
        if (body.action === "reconcile")
          requirePermission(user, "products", "edit");
        if (["preview", "push"].includes(String(body.action))) {
          f = "stockPush";
          action = "approve";
        } else {
          f = "integrations";
          action = "edit";
        }
      }
      if (url.pathname === "/api/products/export") {
        requirePermission(user, "inventoryExports", "export");
        requirePermission(user, "productPricing", "export");
        requirePermission(user, "materialCosts", "export");
        action = "export";
      }
      requirePermission(user, f, action);
      const auditTables: Record<string, string> = {
        products: "products",
        materials: "materials",
        recipes: "recipes",
        manufacturing: "manufacturing_batches",
        orders: "sales_orders",
        purchases: "purchase_orders",
        vendors: "suppliers",
        stocktakes: "stocktakes",
        adjustments: "adjustments",
      };
      const auditTable = auditTables[feature];
      const recordId = Number(body.id ?? body.product_id);
      const before =
        mutating && auditTable && Number.isSafeInteger(recordId)
          ? db.prepare(`SELECT * FROM ${auditTable} WHERE id=?`).get(recordId)
          : undefined;
      // Financial fields cannot be changed through a less privileged module action.
      if (
        mutating &&
        [
          "products",
          "materials",
          "recipes",
          "orders",
          "purchases",
          "manufacturing",
        ].includes(feature)
      ) {
        const costKeys = [
          "cost_per_unit",
          "unit_cost",
          "hourly_labor_rate",
          "overhead",
        ];
        const priceKeys = ["retail_price", "wholesale_price"];
        if (costKeys.some((k) => body[k] !== undefined))
          requirePermission(user, "materialCosts", "edit");
        if (priceKeys.some((k) => body[k] !== undefined))
          requirePermission(user, "productPricing", "edit");
        if (
          body.total !== undefined ||
          body.total_cost !== undefined ||
          (body.price !== undefined &&
            ["order", "purchase"].includes(String(body.action)))
        )
          requirePermission(user, "orderTotals", "edit");
      }
      const response = await handler(request);
      response.headers.set("Cache-Control", "private, no-store");
      if (mutating) {
        let affectedId = Number.isSafeInteger(recordId) ? recordId : undefined;
        if (
          response.ok &&
          response.headers.get("content-type")?.includes("application/json")
        ) {
          const result = await response.clone().json();
          if (typeof result.id === "number") affectedId = result.id;
        }
        const after =
          auditTable && affectedId
            ? db
                .prepare(`SELECT * FROM ${auditTable} WHERE id=?`)
                .get(affectedId)
            : undefined;
        audit(
          user,
          `${request.method} ${url.pathname}${body.action ? ":" + body.action : ""}`,
          String(affectedId ?? ""),
          response.ok,
          { status: response.status, before, after },
        );
      }
      if (response.headers.get("content-type")?.includes("application/json")) {
        const data = await response.json();
        const clean =
          feature === "dashboard"
            ? dashboardFor(data, user)
            : redact(data, user);
        return NextResponse.json(clean, {
          status: response.status,
          headers: response.headers,
        });
      }
      return response;
    } catch (e) {
      const status = e instanceof AccessError ? e.status : 503;
      audit(user, `${request.method} ${url.pathname}`, "", false, { status });
      return NextResponse.json(
        {
          error:
            e instanceof AccessError
              ? e.message
              : "Account service unavailable. Check server configuration.",
        },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  };
}
