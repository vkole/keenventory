"use client";
import { useEffect, useState, useCallback } from "react";
import type { ProductRecord } from "@/lib/productStore";
import { can, type Viewer } from "@/lib/permissions";
import { buttonClass, inputClass, dollars, jsonRequest } from "./ProductForm";
export const productActions = [
  "Edit Product",
  "Manufacture Product",
  "Add Order",
  "Add Purchase",
  "Add Variation",
  "Transfer Stock",
  "Add Adjustment",
  "Stock Push",
  "Manage Variation Attributes",
  "Print Tracking Label",
  "Copy Product",
  "Componentize",
  "Merge Into",
  "Delete / Archive",
];
export function ProductMenu({
  onAction,
}: {
  onAction: (action: string) => void;
}) {
  return (
    <details className="relative">
      <summary
        aria-label="Product actions"
        className="cursor-pointer list-none rounded-lg border px-3 py-1"
      >
        ···
      </summary>
      <div className="absolute right-0 z-30 w-60 rounded-xl border bg-white p-2 shadow-xl">
        {productActions.map((a) => (
          <button
            type="button"
            className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#F4EAE8] ${["Componentize", "Merge Into", "Delete / Archive"].includes(a) ? "text-red-700" : ""}`}
            key={a}
            onClick={(e) => {
              e.currentTarget.closest("details")?.removeAttribute("open");
              onAction(a);
            }}
          >
            {a}
          </button>
        ))}
      </div>
    </details>
  );
}
export function ShopifyPanel({
  product,
  onSaved,
  initialPush = false,
  user,
}: {
  product: ProductRecord;
  onSaved: () => void;
  initialPush?: boolean;
  user?: Viewer;
}) {
  const canEdit = !user || can(user, "integrations", "edit");
  const canPush = !user || can(user, "stockPush", "approve");
  const canReconcile = canEdit && (!user || can(user, "products", "edit"));
  const [config, setConfig] = useState<{
    configured: boolean;
    shop?: string;
    error?: string;
    locations: { id: string; name: string }[];
  }>({ configured: false, locations: [] });
  const [mapping, setMapping] = useState<{
    variant_id?: string;
    location_id?: string;
    local_location?: string;
    remote_sku?: string;
  } | null>(null);
  const [variant, setVariant] = useState("");
  const [location, setLocation] = useState("");
  const [local, setLocal] = useState(product.location);
  const [preview, setPreview] = useState<{
    id: number;
    local: number;
    remote: number;
    sku: string;
    remote_sku: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState("pull");
  const load=useCallback(async()=> {
    const [c, d] = await Promise.all([
      jsonRequest("/api/products/shopify"),
      jsonRequest(`/api/products?id=${product.id}`),
    ]);
    setConfig(c);
    const m = d.listings[0] ?? null;
    setMapping(m);
    setVariant(m?.variant_id ?? "");
    setLocation(m?.location_id ?? c.locations[0]?.id ?? "");
    setLocal(m?.local_location || product.location);
  },[product.id,product.location]);
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);
  async function action(type: string) {
    setBusy(true);
    setMessage("");
    try {
      const body = await jsonRequest("/api/products/shopify", {
        id: product.id,
        action: type,
        variant_id: variant,
        location_id: location,
        local_location: local,
        preview_id: preview?.id,
        direction,
        confirm: true,
      });
      if (type === "preview") setPreview(body);
      else {
        setPreview(null);
        setMessage("Shopify action completed.");
        await load();
        onSaved();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Shopify request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <h4 className="text-lg font-semibold">Shopify listings and inventory</h4>
      {!config.configured ? (
        <p className="rounded-xl bg-[#F4EAE8] p-3">
          {config.error ??
            "Configure SHOPIFY_SHOP and SHOPIFY_ADMIN_ACCESS_TOKEN on the server to connect Shopify. No stock will be sent until a mapping and push are confirmed."}
        </p>
      ) : (
        <>
          <p>Connected store: {config.shop}</p>
          <label className="grid gap-1">
            Permanent Shopify variant ID
            <input
              className={inputClass}
              placeholder="gid://shopify/ProductVariant/123"
              value={variant}
              disabled={!!mapping || !canEdit}
              onChange={(e) => setVariant(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            Shopify location
            <select
              className={inputClass}
              value={location}
              disabled={!canEdit}
              onChange={(e) => setLocation(e.target.value)}
            >
              {config.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            Local location
            <input
              className={inputClass}
              value={local}
              disabled={!canEdit}
              onChange={(e) => setLocal(e.target.value)}
            />
          </label>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              className={buttonClass}
              onClick={() => action("map")}
            >
              {mapping ? "Update location mapping" : "Verify and save mapping"}
            </button>
          )}
          {mapping && (
            <>
              <p>
                Local SKU: {product.sku} · Shopify SKU: {mapping.remote_sku}{" "}
                {mapping.remote_sku !== product.sku && (
                  <strong className="text-amber-800">· SKU differs</strong>
                )}
              </p>
              <div className="flex flex-wrap gap-3">
                {canEdit && (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => action("refresh")}
                  >
                    Refresh listing
                  </button>
                )}
                {canPush && (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => action("preview")}
                  >
                    Preview Stock Push
                  </button>
                )}
              </div>
              <p className="text-sm">
                Stock Push sends only available inventory at the mapped local
                location. It does not update SKUs or prices.
              </p>
              {preview && canPush && (
                <div className="space-y-3 rounded-xl bg-[#F4EAE8] p-4">
                  <p>
                    Shopify quantity: {preview.remote} → Keenventory available:{" "}
                    {preview.local}
                  </p>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Set Shopify inventory to ${preview.local}?`,
                        )
                      )
                        action("push");
                    }}
                  >
                    Confirm and Submit Stock Push
                  </button>
                </div>
              )}
              {canReconcile && (
                <>
                  <label className="grid gap-1">
                    SKU reconciliation
                    <select
                      className={inputClass}
                      value={direction}
                      onChange={(e) => setDirection(e.target.value)}
                    >
                      <option value="pull">Use Shopify SKU locally</option>
                      <option value="push">Send local SKU to Shopify</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Explicitly reconcile the SKU in the selected direction? Inventory quantities and ID mappings are unchanged.",
                        )
                      )
                        action("reconcile");
                    }}
                  >
                    Confirm SKU Reconciliation
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function ProductActionDialog({
  product,
  action,
  products,
  onSaved,
  onClose,
}: {
  product: ProductRecord;
  action: string;
  products: ProductRecord[];
  onSaved: (id?: number) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState({
    quantity: 1,
    price:
      action === "Add Order" ? product.retail_price : product.cost_per_unit,
    location: product.location,
    from: product.location,
    to: "",
    contact: "",
    reason: "",
    name: `${product.name} (copy)`,
    sku: `${product.sku}-${action === "Componentize" ? "COMP" : "COPY"}`,
    copy_images: false,
    target_id: 0,
    attributes: JSON.stringify(
      JSON.parse(product.attribute_definitions),
      null,
      2,
    ),
    qr: true,
  });
  const [attributeRows, setAttributeRows] = useState<
    { name: string; values: string }[]
  >(
    Object.entries(
      JSON.parse(product.attribute_definitions) as Record<string, string[]>,
    ).map(([name, values]) => ({ name, values: values.join(", ") })),
  );
  const [key] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    source: { references: Record<string, number> };
    target: { product: ProductRecord };
  } | null>(null);
  const actionName: Record<string, string> = {
    "Add Order": "order",
    "Add Purchase": "purchase",
    "Transfer Stock": "transfer",
    "Add Adjustment": "adjust",
    "Manage Variation Attributes": "attributes",
    "Copy Product": "copy",
    Componentize: "componentize",
    "Merge Into": "merge",
    "Delete / Archive": "archive",
    Stocktake: "stocktake",
  };
  async function submit(override?: string, confirm = false) {
    setBusy(true);
    setMessage("");
    try {
      const result = await jsonRequest("/api/products/actions", {
        ...values,
        id: product.id,
        action: override ?? actionName[action],
        attributes:
          action === "Manage Variation Attributes"
            ? Object.fromEntries(
                attributeRows.map((r) => [
                  r.name.trim(),
                  r.values
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                ]),
              )
            : undefined,
        request_key: key,
        confirm,
      });
      if (result.preview) {
        setPreview(result.preview);
        return;
      }
      onSaved(result.id);
      onClose();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  const text = (
    label: string,
    key: "location" | "from" | "to" | "contact" | "reason" | "name" | "sku",
  ) => (
    <label className="grid gap-1">
      {label}
      <input
        className={inputClass}
        required
        value={values[key]}
        onChange={(e) => setValues({ ...values, [key]: e.target.value })}
      />
    </label>
  );
  const number = (label: string, key: "quantity" | "price") => (
    <label className="grid gap-1">
      {label}
      <input
        className={inputClass}
        required
        type="number"
        step="0.000001"
        min={
          action === "Add Adjustment"
            ? undefined
            : key === "quantity" && action !== "Stocktake"
              ? 0.000001
              : 0
        }
        value={values[key]}
        onChange={(e) =>
          setValues({ ...values, [key]: Number(e.target.value) })
        }
      />
    </label>
  );
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[#000E2D]/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={action}
    >
      <form
        className="my-auto w-full max-w-2xl space-y-4 rounded-3xl bg-white p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (action === "Stock Push") return;
          if (action === "Print Tracking Label") {
            window.open(
              `/api/products/label?id=${product.id}&qr=${values.qr}`,
              "_blank",
              "noopener,noreferrer",
            );
            return;
          }
          if (
            action === "Componentize" &&
            !window.confirm(
              "Convert the selected finished units into component inventory? This writes both inventory histories.",
            )
          )
            return;
          submit(undefined, action === "Componentize");
        }}
      >
        <div className="flex justify-between">
          <h3 className="text-xl font-semibold">{action}</h3>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <p>
          {product.name} · {product.sku}
        </p>
        {action === "Stock Push" ? (
          <ShopifyPanel
            product={product}
            onSaved={() => onSaved(product.id)}
            initialPush
          />
        ) : (
          <>
            {["Add Order", "Add Purchase"].includes(action) && (
              <>
                {text(
                  action === "Add Order" ? "Customer" : "Supplier",
                  "contact",
                )}
                {number("Quantity", "quantity")}
                {number(
                  action === "Add Order"
                    ? "Unit sale price ($)"
                    : "Unit purchase cost ($)",
                  "price",
                )}
                {text("Inventory location", "location")}
                <p className="text-sm">
                  Total: {dollars(values.quantity * values.price)}.{" "}
                  {action === "Add Order"
                    ? "Stock is reserved until fulfillment."
                    : "Stock increases when the purchase is received."}
                </p>
              </>
            )}
            {action === "Transfer Stock" && (
              <>
                {text("From location", "from")}
                {text("To location", "to")}
                {number("Quantity to transfer", "quantity")}
                {text("Transfer reason", "reason")}
              </>
            )}
            {["Add Adjustment", "Stocktake", "Componentize"].includes(
              action,
            ) && (
              <>
                {number(
                  action === "Add Adjustment"
                    ? "Quantity change (use negative for reduction)"
                    : action === "Stocktake"
                      ? "Physical count"
                      : "Units to convert",
                  "quantity",
                )}
                {text("Inventory location", "location")}
                {text("Reason", "reason")}
                {action === "Componentize" && (
                  <>
                    {text("Component SKU (new or existing)", "sku")}
                    <p>
                      Conversion is one finished unit to one component unit,
                      using the product measurement type. Inventory history is
                      retained.
                    </p>
                  </>
                )}
              </>
            )}
            {action === "Copy Product" && (
              <>
                {text("Copy name", "name")}
                {text("New unique SKU", "sku")}
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={values.copy_images}
                    onChange={(e) =>
                      setValues({ ...values, copy_images: e.target.checked })
                    }
                  />
                  Copy product images
                </label>
                <p>
                  Inventory starts at zero. Historical transactions and Shopify
                  mappings are not copied.
                </p>
              </>
            )}
            {action === "Manage Variation Attributes" && (
              <section className="space-y-3">
                <p>
                  Configure attributes such as Size, Scent, Color, or Vessel.
                  Enter allowed values separated by commas.
                </p>
                {attributeRows.map((row, index) => (
                  <div
                    className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]"
                    key={index}
                  >
                    <label>
                      Attribute name
                      <input
                        required
                        className={inputClass}
                        value={row.name}
                        onChange={(e) =>
                          setAttributeRows(
                            attributeRows.map((r, j) =>
                              j === index ? { ...r, name: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Allowed values
                      <input
                        required
                        className={inputClass}
                        placeholder="12 oz, 2 oz, Wax melt"
                        value={row.values}
                        onChange={(e) =>
                          setAttributeRows(
                            attributeRows.map((r, j) =>
                              j === index
                                ? { ...r, values: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setAttributeRows(
                          attributeRows.filter((_, j) => j !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() =>
                    setAttributeRows([
                      ...attributeRows,
                      { name: "", values: "" },
                    ])
                  }
                >
                  Add Attribute
                </button>
                <p className="text-sm">
                  Values already used by variations must be retained.
                </p>
              </section>
            )}
            {action === "Print Tracking Label" && (
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={values.qr}
                  onChange={(e) =>
                    setValues({ ...values, qr: e.target.checked })
                  }
                />
                Include a QR code for the barcode or SKU
              </label>
            )}
            {action === "Merge Into" && (
              <>
                <label className="grid gap-1">
                  Target product
                  <select
                    required
                    className={inputClass}
                    value={values.target_id}
                    onChange={(e) => {
                      setValues({
                        ...values,
                        target_id: Number(e.target.value),
                      });
                      setPreview(null);
                    }}
                  >
                    <option value="0">Choose target</option>
                    {products
                      .filter((p) => p.id !== product.id && !p.archived_at)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.sku}
                        </option>
                      ))}
                  </select>
                </label>
                <p>
                  Preview balances and affected references before confirming.
                  The source is archived and its history remains accessible.
                </p>
                {preview && (
                  <div className="space-y-3 rounded-xl bg-[#F4EAE8] p-4">
                    <p>
                      Source stock {product.stock_quantity} + Target stock{" "}
                      {preview.target.product.stock_quantity}
                    </p>
                    {Object.entries(preview.source.references).map(([k, v]) => (
                      <p key={k}>
                        {k}: {v}
                      </p>
                    ))}
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-xl bg-red-700 px-4 py-3 text-white"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Confirm merging into this target? Stock will move and the source will be archived.",
                          )
                        )
                          submit("merge", true);
                      }}
                    >
                      Confirm Merge
                    </button>
                  </div>
                )}
              </>
            )}
            {action === "Delete / Archive" && (
              <>
                <p>
                  Archive to retain all history. Permanent deletion is permitted
                  only without stock or protected references.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-xl bg-red-700 px-4 py-3 text-white"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Archive this product and retain its history?",
                        )
                      )
                        submit("archive", true);
                    }}
                  >
                    Archive Product
                  </button>
                  {product.archived_at && (
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => submit("restore", true)}
                    >
                      Restore Product
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-xl border border-red-700 px-4 py-3 text-red-700"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Permanently delete this product? This cannot be undone. Products with stock or protected history cannot be deleted.",
                        )
                      )
                        submit("delete", true);
                    }}
                  >
                    Permanently Delete
                  </button>
                </div>
              </>
            )}
            {action !== "Delete / Archive" && (
              <button type="submit" className={buttonClass} disabled={busy}>
                {action === "Merge Into"
                  ? "Preview Merge"
                  : action === "Print Tracking Label"
                    ? "Open Printable Label"
                    : action === "Copy Product"
                      ? "Copy Product"
                      : "Save"}
              </button>
            )}
          </>
        )}
        {message && (
          <p role="alert" className="rounded-xl bg-[#F4EAE8] p-3">
            {message}
          </p>
        )}
        <button type="button" className="px-4 py-2" onClick={onClose}>
          Cancel
        </button>
      </form>
    </div>
  );
}

export function ProductChannelHub({
  products,
  onRefresh,
  user,
}: {
  products: ProductRecord[];
  onRefresh: () => void;
  user?: Viewer;
}) {
  const [id, setId] = useState(
    products.find((p) => !p.archived_at && p.state === "Active")?.id ?? 0,
  );
  const p = products.find((p) => p.id === id);
  return (
    <section className="card space-y-5 rounded-3xl p-5">
      <label className="grid gap-2">
        Product
        <select
          className={inputClass}
          value={id}
          onChange={(e) => setId(Number(e.target.value))}
        >
          {products
            .filter((p) => !p.archived_at && p.state === "Active")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.sku}
              </option>
            ))}
        </select>
      </label>
      {p ? (
        <ShopifyPanel key={p.id} product={p} onSaved={onRefresh} user={user} />
      ) : (
        <p>Create an active product before configuring listings.</p>
      )}
    </section>
  );
}
