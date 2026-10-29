"use client";
import Link from "next/link";
import { ScopedManufacturing } from "./ScopedManufacturing";
import { useState } from "react";
import type { DashboardData } from "@/lib/data";
import { can, featureLabels, type Viewer } from "@/lib/permissions";
import { AccountMenu } from "./AccountMenu";
import { buttonClass, inputClass, jsonRequest } from "./ProductForm";
import { ProductActionDialog, ProductChannelHub } from "./ProductActions";
import type { ProductRecord } from "@/lib/productStore";
type Row = Record<string, unknown>;
const collections: Record<string, keyof DashboardData> = {
  products: "products",
  materials: "materials",
  components: "materials",
  recipes: "recipes",
  manufacturing: "manufacturingBatches",
  orders: "salesOrders",
  purchases: "purchaseOrders",
  vendors: "suppliers",
  stocktakes: "stocktakes",
  adjustments: "adjustments",
};
const forms: Record<string, [string, string, string?][]> = {
  products: [
    ["name", "Product Name"],
    ["sku", "SKU"],
    ["category", "Category"],
    ["location", "Storage Location"],
  ],
  materials: [
    ["name", "Material Name"],
    ["sku", "SKU"],
    ["category", "Category"],
    ["unit", "Measurement Unit"],
    ["location", "Storage Location"],
  ],
  components: [
    ["name", "Component Name"],
    ["sku", "SKU"],
    ["unit", "Measurement Unit"],
    ["location", "Storage Location"],
  ],
  orders: [
    ["customer", "Customer"],
    ["channel", "Channel"],
  ],
  purchases: [["supplier", "Supplier"]],
  vendors: [
    ["company_name", "Company Name"],
    ["contact_name", "Contact Name"],
    ["email", "Email", "email"],
    ["phone", "Phone"],
  ],
  stocktakes: [
    ["inventory_name", "Inventory Name"],
    ["location", "Location"],
    ["actual_quantity", "Physical Count", "number"],
  ],
  adjustments: [
    ["item_name", "Inventory Name"],
    ["quantity", "Quantity Change", "number"],
    ["reason", "Reason"],
  ],
};
export function RestrictedWorkspace({
  initialData,
  user,
}: {
  initialData: DashboardData;
  user: Viewer;
}) {
  const [data, setData] = useState(initialData),
    [tab, setTab] = useState("dashboard"),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [productAction, setProductAction] = useState<{
    product: ProductRecord;
    name: string;
  } | null>(null);
  const modules = [
    ...Object.keys(collections),
    "reporting",
    ...(can(user, "integrations") && can(user, "products")
      ? ["integrations"]
      : []),
  ].filter((f) => can(user, f));
  const productOptions: [string, string, import("@/lib/permissions").Action][] =
    [
      ["Edit Product", "products", "edit"],
      ["Add Order", "orders", "create"],
      ["Add Purchase", "purchases", "create"],
      ["Transfer Stock", "transfers", "create"],
      ["Add Adjustment", "adjustments", "create"],
      ["Stocktake", "stocktakes", "create"],
      ["Manage Variation Attributes", "products", "edit"],
      ["Copy Product", "products", "create"],
      ["Componentize", "components", "create"],
      ["Merge Into", "products", "delete"],
      ["Delete / Archive", "products", "delete"],
    ];
  const rows = (data[collections[tab]] ?? []) as unknown as Row[];
  const component = (r: Row) =>
    /component|jar|lid|wick|label|packaging|box/i.test(
      String(r.category) + " " + String(r.name),
    );
  const shown = rows.filter(
    (r) =>
      (tab !== "components" || component(r)) &&
      (tab !== "materials" || !component(r)) &&
      JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
  );
  const columns = shown.length
    ? Object.keys(shown[0])
        .filter(
          (k) =>
            ![
              "organization_id",
              "recipe_snapshot",
              "consumption",
              "request_key",
              "ingredients",
              "images",
              "locations",
              "attributes",
              "attribute_definitions",
              "description",
              "notes",
              "instructions",
              "image_id",
              "parent_id",
              "merged_into_id",
              "barcode",
              "auto_manufacture",
            ].includes(k) && !k.endsWith("_at"),
        )
        .slice(0, 14)
    : [];
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const endpoint =
        tab === "vendors"
          ? "suppliers"
          : tab === "components"
            ? "materials"
            : tab;
      await jsonRequest("/api/" + endpoint, {
        ...form,
        ...(editing ? { id: editing } : {}),
        ...(tab === "components" ? { category: "Component" } : {}),
      });
      setData(await jsonRequest("/api/dashboard"));
      setForm({});
      setEditing(null);
      setMessage("Record saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  function navigate(f: string) {
    setTab(f);
    setForm({});
    setEditing(null);
    setMessage("");
    setSearch("");
  }
  const links = ["dashboard", ...modules];
  return (
    <div className="min-h-screen bg-[#F4EAE8] text-[#000E2D]">
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="hidden min-h-screen w-72 shrink-0 bg-[#000E2D] p-6 text-white lg:block">
          <Link className="mb-8 block font-serif text-2xl" href="/">
            Keenventory
          </Link>
          <nav className="grid gap-2">
            {links.map((f) => (
              <button
                className={
                  "rounded-xl p-3 text-left " + (tab === f ? "bg-white/15" : "")
                }
                key={f}
                onClick={() => navigate(f)}
              >
                {f === "dashboard" ? "Dashboard" : featureLabels[f]}
              </button>
            ))}
          </nav>
          <p className="mt-10 text-sm text-slate-300">
            Keen Scents · {user.role}
          </p>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-8">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5">
            <h1 className="text-2xl font-semibold">
              {tab === "dashboard"
                ? "Keenventory Dashboard"
                : featureLabels[tab]}
            </h1>
            <AccountMenu user={user} />
          </header>
          <select
            aria-label="Module"
            className={inputClass + " mb-5 lg:hidden"}
            value={tab}
            onChange={(e) => navigate(e.target.value)}
          >
            {links.map((f) => (
              <option key={f} value={f}>
                {f === "dashboard" ? "Dashboard" : featureLabels[f]}
              </option>
            ))}
          </select>
          {message && (
            <p role="alert" className="mb-4 rounded-xl bg-white p-3">
              {message}
            </p>
          )}
          {tab === "dashboard" ? (
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {modules.map((f) => (
                <button
                  key={f}
                  onClick={() => navigate(f)}
                  className="rounded-3xl bg-white p-6 text-left shadow-sm"
                >
                  <h2 className="text-xl">{featureLabels[f]}</h2>
                  <p className="mt-2 text-sm text-[#868F9E]">
                    Open permitted records
                  </p>
                </button>
              ))}
            </section>
          ) : (
            <section className="space-y-5 rounded-3xl bg-white p-5">
              <input
                className={inputClass}
                aria-label="Search records"
                placeholder="Search records"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      {columns.map((k) => (
                        <th
                          className="whitespace-nowrap p-3 capitalize"
                          key={k}
                        >
                          {k.replaceAll("_", " ")}
                        </th>
                      ))}
                      {tab === "products" && <th className="p-3">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r, i) => (
                      <tr className="border-t" key={String(r.id ?? i)}>
                        {columns.map((k) => (
                          <td className="p-3" key={k}>
                            {typeof r[k] === "object"
                              ? "—"
                              : String(r[k] ?? "—")}
                          </td>
                        ))}
                        {tab === "products" && (
                          <td className="p-3">
                            <details>
                              <summary
                                aria-label={`Actions for ${r.name}`}
                                className="cursor-pointer"
                              >
                                ···
                              </summary>
                              <div className="grid min-w-44 gap-2 py-2">
                                {productOptions
                                  .filter(
                                    ([name, f, a]) =>
                                      can(user, f, a) &&
                                      (!["Add Order", "Add Purchase"].includes(
                                        name,
                                      ) ||
                                        can(user, "orderTotals", "edit")) &&
                                      (name !== "Componentize" ||
                                        can(user, "products", "edit")),
                                  )
                                  .map(([name]) => (
                                    <button
                                      key={name}
                                      className={
                                        "text-left " +
                                        ([
                                          "Delete / Archive",
                                          "Merge Into",
                                          "Componentize",
                                        ].includes(name)
                                          ? "text-red-700"
                                          : "")
                                      }
                                      onClick={() => {
                                        if (name === "Edit Product") {
                                          setEditing(Number(r.id));
                                          setForm(
                                            Object.fromEntries(
                                              forms.products.map(([key]) => [
                                                key,
                                                String(r[key] ?? ""),
                                              ]),
                                            ),
                                          );
                                        } else
                                          setProductAction({
                                            product: r as ProductRecord,
                                            name,
                                          });
                                      }}
                                    >
                                      {name}
                                    </button>
                                  ))}
                                <a
                                  href={`/api/products/label?id=${r.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Print Tracking Label
                                </a>
                              </div>
                            </details>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!shown.length && <p className="p-4">No records match.</p>}
              </div>
              {tab === "manufacturing" && (
                <ScopedManufacturing
                  data={data}
                  user={user}
                  onSaved={async () => {
                    setData(await jsonRequest("/api/dashboard"));
                  }}
                />
              )}
              {tab === "reporting" && (
                <div className="grid gap-3">
                  <h2 className="text-xl">Product Reports</h2>
                  {can(user, "products", "export") &&
                  can(user, "inventoryExports", "export") &&
                  can(user, "materialCosts", "export") &&
                  can(user, "productPricing", "export") ? (
                    (["worksheet", "prices", "stock"] as const).map(
                      (report) => (
                        <a
                          key={report}
                          className="underline"
                          href={`/api/products/export?report=${report}`}
                        >
                          {report === "worksheet"
                            ? "Product Inventory Worksheet"
                            : report === "prices"
                              ? "Product Price List"
                              : "Product Stock Report"}
                        </a>
                      ),
                    )
                  ) : (
                    <p>
                      Your access does not include product inventory exports.
                    </p>
                  )}
                </div>
              )}
              {tab === "integrations" && (
                <ProductChannelHub
                  user={user}
                  products={data.products as unknown as ProductRecord[]}
                  onRefresh={async () =>
                    setData(await jsonRequest("/api/dashboard"))
                  }
                />
              )}
              {(editing ? can(user, tab, "edit") : can(user, tab, "create")) &&
                forms[tab] && (
                  <form
                    className="grid gap-4 border-t pt-5 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      save();
                    }}
                  >
                    <h2 className="text-xl sm:col-span-2">
                      {editing ? "Edit" : "Add"} {featureLabels[tab]}
                    </h2>
                    {forms[tab].map(([key, title, type]) => (
                      <label className="grid gap-2 text-sm" key={key}>
                        {title}
                        <input
                          required
                          className={inputClass}
                          type={type ?? "text"}
                          step={type === "number" ? "any" : undefined}
                          value={form[key] ?? ""}
                          onChange={(e) =>
                            setForm({ ...form, [key]: e.target.value })
                          }
                        />
                      </label>
                    ))}
                    <button disabled={busy} className={buttonClass}>
                      {busy ? "Saving…" : "Save"}
                    </button>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setForm({});
                        }}
                      >
                        Cancel Editing
                      </button>
                    )}
                  </form>
                )}
            </section>
          )}
        </main>
        {productAction && (
          <ProductActionDialog
            product={productAction.product}
            action={productAction.name}
            products={data.products as unknown as ProductRecord[]}
            onClose={() => setProductAction(null)}
            onSaved={async () => {
              setData(await jsonRequest("/api/dashboard"));
            }}
          />
        )}
      </div>
    </div>
  );
}
