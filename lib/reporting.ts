import type Database from "better-sqlite3";
import { reportTypes, type ReportResult, type ReportRow } from "./reportTypes";
import {
  addDate,
  dateInZone,
  instant,
  parseInstant,
  validTimezone,
} from "./calendarDates";
import { requirePermission } from "./access";
import type { Viewer } from "./permissions";
import { money, quantity } from "./production";
type Row = Record<string, any>;
export function reportPermissions(
  user: Viewer,
  type: string,
  exporting = false,
) {
  requirePermission(user, "reporting", exporting ? "export" : "view");
  const spec = reportTypes.find((r) => r[0] === type);
  if (!spec) throw Error("Choose a valid report type.");
  const category = spec[2];
  if (category === "Sales") {
    requirePermission(user, "orders");
    if (type !== "orders") requirePermission(user, "orderTotals");
    if (["sales_product", "sales_category"].includes(type))
      requirePermission(user, "products");
  }
  if (category === "Inventory") {
    requirePermission(user, "products");
    requirePermission(user, "materials");
    requirePermission(user, "components");
    if (type === "inventory_value") requirePermission(user, "materialCosts");
    if (type === "usage") requirePermission(user, "manufacturing");
    if (type === "adjustments") requirePermission(user, "adjustments");
  }
  if (category === "Manufacturing") {
    requirePermission(user, "manufacturing");
    if (!["volume", "production_history"].includes(type))
      requirePermission(user, "materialCosts");
  }
  if (category === "Profitability") {
    for (const f of [
      "orders",
      "manufacturing",
      "products",
      "profitability",
      "materialCosts",
      "orderTotals",
    ])
      requirePermission(user, f);
  }
  if (exporting) {
    requirePermission(
      user,
      category === "Sales"
        ? "orders"
        : category === "Manufacturing"
          ? "manufacturing"
          : category === "Inventory"
            ? "inventoryExports"
            : "orders",
      "export",
    );
    if (
      (category === "Sales" && type !== "orders") ||
      category === "Profitability"
    )
      requirePermission(user, "orderTotals", "export");
    if (
      type === "inventory_value" ||
      category === "Profitability" ||
      (category === "Manufacturing" &&
        !["volume", "production_history"].includes(type))
    )
      requirePermission(user, "materialCosts", "export");
  }
  return spec;
}
export function buildReport(
  db: Database.Database,
  user: Viewer,
  params: URLSearchParams,
): ReportResult {
  const type = params.get("type") ?? "revenue",
    spec = reportPermissions(user, type),
    zone = validTimezone(params.get("timezone") ?? "America/New_York"),
    end = params.get("end") || dateInZone(new Date(), zone),
    start = params.get("start") || "1900-01-01",
    grouping = params.get("grouping") ?? "daily";
  if (!["daily", "weekly", "monthly", "quarterly", "yearly"].includes(grouping))
    throw Error("Choose a valid grouping.");
  const startMs = Date.parse(instant(start, "00:00", zone)),
    endMs = Date.parse(instant(addDate(end, 1), "00:00", zone));
  if (endMs <= startMs) throw Error("The end date must follow the start date.");
  const warnings = new Set<string>(),
    products = db
      .prepare("SELECT * FROM products WHERE organization_id=1")
      .all() as Row[],
    materials = db
      .prepare("SELECT * FROM materials WHERE organization_id=1")
      .all() as Row[];
  const filters = Object.fromEntries(
    ["category", "location", "channel", "product_id"]
      .map((k) => [k, params.get(k) ?? ""])
      .filter(([, v]) => v),
  );
  const match = (p: Row) =>
    !filters.category || p.category === filters.category;
  const matchProduct = (id: number) => {
    const p = products.find((p) => p.id === id);
    return (
      !!p &&
      match(p) &&
      (!filters.product_id || Number(filters.product_id) === id)
    );
  };
  function key(date: string) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dateInZone(date, zone);
    if (grouping === "daily") return d;
    if (grouping === "monthly") return d.slice(0, 7);
    if (grouping === "yearly") return d.slice(0, 4);
    if (grouping === "quarterly")
      return d.slice(0, 4) + " Q" + Math.ceil(Number(d.slice(5, 7)) / 3);
    return addDate(d, -((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7));
  }
  const orders = db
      .prepare(
        "SELECT * FROM sales_orders WHERE organization_id=1 AND status NOT IN ('Cancelled','Draft')",
      )
      .all() as Row[],
    lines = db
      .prepare("SELECT * FROM sales_order_lines WHERE organization_id=1")
      .all() as Row[],
    batches = db
      .prepare(
        "SELECT * FROM manufacturing_batches WHERE organization_id=1 AND status='Completed'",
      )
      .all() as Row[],
    ledger = db
      .prepare(
        "SELECT * FROM inventory_ledger WHERE organization_id=1 ORDER BY id",
      )
      .all() as Row[];
  const hasPeriod = (date: string, a: number, b: number) => {
    const t = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? Date.parse(instant(date, "00:00", zone))
      : parseInstant(date).getTime();
    return t >= a && t < b;
  };
  function inventoryAt(b: number) {
    const snapshots = db
      .prepare(
        "SELECT * FROM inventory_snapshots WHERE organization_id=1 ORDER BY id",
      )
      .all() as Row[];
    const list: Row[] = [];
    for (const [kind, items] of [
      ["product", products],
      ["material", materials],
    ] as const) {
      for (const item of items) {
        if (
          !match(item) ||
          (filters.product_id &&
            (kind !== "product" || Number(filters.product_id) !== item.id))
        )
          continue;
        const own = ledger.filter(
          (l) =>
            l[kind === "product" ? "product_id" : "material_id"] === item.id &&
            parseInstant(l.created_at).getTime() < b,
        );
        const snaps = snapshots.filter(
          (s) =>
            s.item_type === kind &&
            s.item_id === item.id &&
            parseInstant(s.recorded_at).getTime() < b,
        );
        if (b > Date.now() && end >= dateInZone(new Date(), zone)) {
          if (kind === "product") {
            for (const loc of db
              .prepare("SELECT * FROM product_locations WHERE product_id=?")
              .all(item.id) as Row[])
              if (!filters.location || filters.location === loc.location)
                list.push({
                  ...item,
                  location: loc.location,
                  n: loc.quantity,
                  cost: item.cost_per_unit,
                });
          } else if (!filters.location || filters.location === item.location)
            list.push({
              ...item,
              n: item.stock_quantity,
              cost: item.cost_per_unit,
            });
          continue;
        }
        const locations =
          kind === "material"
            ? ["Inventory"]
            : Array.from(
                new Set([
                  ...own.map((l) => l.location),
                  ...snaps.map((s) => s.location),
                ]),
              );
        for (const location of locations) {
          if (
            filters.location &&
            kind === "product" &&
            location !== filters.location
          )
            continue;
          if (
            filters.location &&
            kind === "material" &&
            item.location !== filters.location
          )
            continue;
          const snapshot = snaps
              .filter((s) => kind === "material" || s.location === location)
              .at(-1),
            moves = own.filter(
              (l) => kind === "material" || l.location === location,
            );
          let n: number, cost: number | null;
          if (snapshot) {
            const after = moves.filter((l) => l.id > (snapshot.ledger_id ?? 0));
            n = snapshot.quantity + after.reduce((s, l) => s + l.delta, 0);
            cost =
              after.filter((l) => l.unit_cost !== null).at(-1)?.unit_cost ??
              snapshot.unit_cost;
          } else if (moves.length) {
            const last = moves.at(-1)!;
            n = last.balance;
            cost = last.unit_cost ?? null;
          } else continue;
          if (cost === null)
            warnings.add(
              "Some historical quantities have no recorded cost snapshot; their inventory value is unavailable.",
            );
          list.push({ ...item, location, n, cost });
        }
      }
    }
    if (!list.length)
      warnings.add(
        "No inventory transactions or snapshots exist at the selected historical date.",
      );
    return list;
  }
  function calculate(a: number, b: number) {
    const grouped = new Map<
      string,
      {
        value: number;
        count: number;
        quantity: number;
        revenue: number;
        production_cost: number;
        unknown: boolean;
      }
    >();
    const add = (
      label: string,
      v: number | null,
      n = 1,
      revenue = 0,
      cost = 0,
      q = 0,
    ) => {
      const row = grouped.get(label) ?? {
        value: 0,
        count: 0,
        quantity: 0,
        revenue: 0,
        production_cost: 0,
        unknown: false,
      };
      row.value += v ?? 0;
      row.unknown ||= v === null;
      row.count += n;
      row.quantity += q;
      row.revenue += revenue;
      row.production_cost += cost;
      grouped.set(label, row);
    };
    const selectedOrders = orders.filter(
      (o) =>
        hasPeriod(o.order_date, a, b) &&
        (!filters.channel || o.channel === filters.channel),
    );
    if (spec[2] === "Sales") {
      for (const order of selectedOrders) {
        const own = lines.filter(
          (l) =>
            l.order_id === order.id &&
            matchProduct(l.product_id) &&
            (!filters.location || l.location === filters.location),
        );
        if (
          (filters.category || filters.product_id || filters.location) &&
          !own.length
        )
          continue;
        if (["sales_product", "sales_category"].includes(type)) {
          for (const line of own) {
            const product = products.find((p) => p.id === line.product_id)!;
            add(
              type === "sales_product" ? product.name : product.category,
              line.quantity * line.unit_price - line.discount,
            );
          }
          if (!own.length)
            warnings.add(
              "Orders without product lines cannot be allocated to a product or category.",
            );
        } else {
          const amount =
            filters.category || filters.product_id || filters.location
              ? own.reduce(
                  (s, l) => s + l.quantity * l.unit_price - l.discount,
                  0,
                )
              : order.total;
          add(
            type === "sales_channel" ? order.channel : key(order.order_date),
            type === "orders" ? 1 : amount,
            1,
          );
        }
      }
    } else if (
      ["inventory_value", "stock", "low_stock", "out_stock"].includes(type)
    ) {
      for (const item of inventoryAt(b)) {
        const value =
          type === "inventory_value"
            ? item.cost === null
              ? null
              : item.n * item.cost
            : type === "stock"
              ? item.n
              : type === "low_stock"
                ? item.n > 0 && item.n <= item.reorder_threshold
                  ? 1
                  : 0
                : item.n <= 0
                  ? 1
                  : 0;
        add(item.name, value);
      }
    } else if (spec[2] === "Inventory") {
      for (const l of ledger.filter(
        (l) =>
          hasPeriod(l.created_at, a, b) &&
          (!filters.location || l.location === filters.location),
      )) {
        if (
          type === "adjustments" &&
          !["Adjustment", "Stocktake"].includes(l.kind)
        )
          continue;
        if (type === "usage" && l.kind !== "Manufacturing consumption")
          continue;
        const item = l.product_id
          ? products.find((p) => p.id === l.product_id)
          : materials.find((m) => m.id === l.material_id);
        if (
          !item ||
          !match(item) ||
          (filters.product_id && l.product_id !== Number(filters.product_id))
        )
          continue;
        add(
          type === "usage" ? item.name : key(l.created_at),
          type === "usage" ? -l.delta : l.delta,
        );
      }
    } else if (spec[2] === "Manufacturing") {
      for (const batch of batches.filter(
        (r) =>
          hasPeriod(r.completed_at ?? r.created_at, a, b) &&
          matchProduct(r.product_id),
      )) {
        const labor = (batch.actual_minutes / 60) * batch.hourly_labor_rate;
        const cost = batch.actual_cost;
        if (
          !batch.recipe_snapshot &&
          !["volume", "production_history"].includes(type)
        )
          warnings.add(
            "Costs are unavailable for legacy batches without recorded cost snapshots.",
          );
        add(
          key(batch.completed_at ?? batch.created_at),
          !batch.recipe_snapshot &&
            !["volume", "production_history"].includes(type)
            ? null
            : type === "labor_cost"
              ? labor
              : type === "material_cost"
                ? Math.max(
                    0,
                    cost -
                      labor -
                      (JSON.parse(batch.recipe_snapshot ?? "{}").overhead ?? 0),
                  )
                : ["volume", "production_history"].includes(type)
                  ? batch.completed_quantity
                  : cost,
          1,
          0,
          0,
          batch.completed_quantity,
        );
      }
    } else {
      for (const order of selectedOrders) {
        const own = lines.filter(
          (l) =>
            l.order_id === order.id &&
            l.fulfilled &&
            matchProduct(l.product_id) &&
            (!filters.location || l.location === filters.location),
        );
        if (!own.length)
          warnings.add(
            "Profit reports exclude orders without fulfilled, costed product lines.",
          );
        for (const line of own) {
          if (line.cost_at_sale === null) {
            warnings.add(
              "Profit reports exclude legacy sales with unknown historical unit costs.",
            );
            continue;
          }
          const revenue = line.quantity * line.unit_price - line.discount,
            cost = line.quantity * line.cost_at_sale;
          add(
            type === "product_profit"
              ? products.find((p) => p.id === line.product_id)!.name
              : key(order.order_date),
            revenue - cost,
            1,
            revenue,
            cost,
            line.quantity,
          );
        }
      }
    }
    const rows: ReportRow[] = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, row]) => ({
        label,
        value: row.unknown
          ? null
          : money(
              type === "average_order"
                ? row.value / row.count
                : type === "unit_cost"
                  ? row.quantity
                    ? row.value / row.quantity
                    : 0
                  : type === "margin"
                    ? row.revenue
                      ? ((row.revenue - row.production_cost) / row.revenue) *
                        100
                      : 0
                    : row.value,
            ),
        ...(spec[2] === "Profitability"
          ? {
              revenue: money(row.revenue),
              production_cost: money(row.production_cost),
            }
          : {}),
        ...(spec[2] === "Manufacturing"
          ? { quantity: quantity(row.quantity) }
          : {}),
      }));
    const raw = [...grouped.values()];
    const total =
      !raw.length &&
      ["inventory_value", "stock", "low_stock", "out_stock"].includes(type)
        ? null
        : raw.some((r) => r.unknown)
          ? null
          : type === "average_order"
            ? raw.reduce((s, r) => s + r.count, 0)
              ? raw.reduce((s, r) => s + r.value, 0) /
                raw.reduce((s, r) => s + r.count, 0)
              : 0
            : type === "unit_cost"
              ? raw.reduce((s, r) => s + r.quantity, 0)
                ? raw.reduce((s, r) => s + r.value, 0) /
                  raw.reduce((s, r) => s + r.quantity, 0)
                : 0
              : type === "margin"
                ? raw.reduce((s, r) => s + r.revenue, 0)
                  ? (raw.reduce((s, r) => s + r.value, 0) /
                      raw.reduce((s, r) => s + r.revenue, 0)) *
                    100
                  : 0
                : raw.reduce((s, r) => s + r.value, 0);
    return { rows, total: total === null ? null : money(total) };
  }
  const current = calculate(startMs, endMs);
  const days =
      Math.round(
        (Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) /
          86400000,
      ) + 1,
    previous =
      start === "1900-01-01"
        ? null
        : calculate(
            Date.parse(instant(addDate(start, -days), "00:00", zone)),
            startMs,
          );
  const categorical = [
    "sales_product",
    "sales_category",
    "sales_channel",
    "product_profit",
    "usage",
    "inventory_value",
    "stock",
    "low_stock",
    "out_stock",
  ].includes(type);
  current.rows.forEach((r) => {
    const previousLabel = categorical
      ? r.label
      : key(
          instant(
            addDate(
              grouping === "quarterly"
                ? r.label.slice(0, 4) +
                    "-" +
                    String((Number(r.label.slice(-1)) - 1) * 3 + 1).padStart(
                      2,
                      "0",
                    ) +
                    "-01"
                : r.label.length === 4
                  ? r.label + "-01-01"
                  : r.label.length === 7
                    ? r.label + "-01"
                    : r.label,
              -days,
            ),
            "00:00",
            zone,
          ),
        );
    r.previous = previous
      ? (previous.rows.find((p) => p.label === previousLabel)?.value ?? 0)
      : null;
  });
  return {
    title: spec[1],
    type,
    unit: spec[3],
    start,
    end,
    timezone: zone,
    grouping,
    generated_at: new Date().toISOString(),
    filters,
    rows: current.rows,
    summary: {
      value: current.total,
      previous: previous?.total ?? null,
      change_percent:
        current.total !== null && previous?.total
          ? money(
              (((current.total ?? 0) - previous.total) /
                Math.abs(previous.total)) *
                100,
            )
          : null,
    },
    warnings: [...warnings],
    categorical: [
      "sales_product",
      "sales_category",
      "sales_channel",
      "product_profit",
      "usage",
      "inventory_value",
      "stock",
      "low_stock",
      "out_stock",
    ].includes(type),
  };
}
