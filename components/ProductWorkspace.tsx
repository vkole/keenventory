'use client';
import Image from 'next/image';
import {ImportWizard} from './ImportWizard';
import { useEffect, useMemo, useState } from 'react';
import type { DashboardData, Recipe } from '@/lib/data';
import type { ProductRecord } from '@/lib/productStore';
import {
  ProductForm,
  buttonClass,
  inputClass,
  dollars,
  jsonRequest,
} from './ProductForm';
import {
  ProductMenu,
  ProductActionDialog,
  ShopifyPanel,
} from './ProductActions';
import { filterProducts } from '@/lib/productFilters';
import { planProduction, pricing } from '@/lib/production';
type Row = Record<string, string | number | null>;
type Detail = {
  product: ProductRecord;
  variations: ProductRecord[];
  locations: Row[];
  ledger: Row[];
  events: Row[];
  manufactures: Row[];
  recipes: Row[];
  orders: Row[];
  purchases: Row[];
  stocktakes: Row[];
  listings: Row[];
  pushes: Row[];
};
const tabs = [
  'Summary',
  'Variations',
  'Manufactures',
  'Orders',
  'Purchases',
  'Listings',
  'Locations',
  'Adjustments',
  'Stocktakes',
  'Push Activity',
];
const columns = [
  'Product Image',
  'SKU',
  'Product Name',
  'Category',
  'On Hand',
  'Available',
  'Low Stock Limit',
  'Sale Price',
  'Status',
];
const exportOptions = [
  'Product Name',
  'SKU',
  'Category',
  'Variation',
  'Location',
  'On Hand',
  'Reserved',
  'Available',
  'Physical Count',
  'Variance',
  'Unit Cost',
  'Inventory Value',
  'Sale Price',
  'Wholesale Price',
  'Low Stock Limit',
  'Status',
];
function HistoryTable({
  rows,
  fields,
  action,
}: {
  rows: Row[];
  fields: [string, string][];
  action?: (row: Row) => React.ReactNode;
}) {
  return !rows.length ? (
    <p className="py-4 text-sm text-[#868F9E]">No records for this product.</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {fields.map(([key, label]) => (
              <th className="whitespace-nowrap p-3" key={key}>
                {label}
              </th>
            ))}
            {action && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={String(row.id ?? i)} className="border-t">
              {fields.map(([key]) => (
                <td key={key} className="p-3">
                  {String(row[key] ?? '—')}
                </td>
              ))}
              {action && <td>{action(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ProductWorkspace({
  data,
  onRefresh,
  onManufacture,
  onRecipes,
}: {
  data: DashboardData;
  onRefresh: () => void;
  onManufacture: (p: ProductRecord) => void;
  onRecipes: (p: ProductRecord) => void;
}) {
  const [rows, setRows] = useState<ProductRecord[]>(
    data.products as unknown as ProductRecord[],
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState('Summary');
  const [form, setForm] = useState<{
    product?: ProductRecord;
    parent?: ProductRecord;
  } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [action, setAction] = useState<{
    product: ProductRecord;
    name: string;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('active');
  const [location, setLocation] = useState('');
  const [sort, setSort] = useState('name');
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [visible, setVisible] = useState(columns);
  const [selection, setSelection] = useState<number[]>([]);
  const [report, setReport] = useState('stock');
  const [customColumns, setCustomColumns] = useState([
    'Product Name',
    'SKU',
    'Available',
    'Sale Price',
  ]);
  const [advancedImport,setAdvancedImport]=useState(false);
  const [importing, setImporting] = useState(false);
  const [csv, setCsv] = useState('');
  const [importPreview, setImportPreview] = useState<{
    hash: string;
    rows: {
      row: number;
      sku: string;
      name: string;
      match_id: number | null;
      archived: boolean;
      opening_quantity: number;
      errors: string[];
    }[];
  } | null>(null);
  const [importMode, setImportMode] = useState('skip');
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState(false);
  const [markup, setMarkup] = useState(150);
  const [margin, setMargin] = useState(50);
  const [pricingMethod, setPricingMethod] = useState('margin');
  const [recipeId, setRecipeId] = useState(0);
  async function refresh(id = selectedId) {
    const result = await jsonRequest('/api/products');
    setRows(result.products);
    if (id) {
      try {
        const d = await jsonRequest(`/api/products?id=${id}`);
        setDetail(d);
        setSelectedId(id);
      } catch {
        setDetail(null);
        setSelectedId(null);
      }
    }
    onRefresh();
  }
  useEffect(() => {
    jsonRequest('/api/products/images?status=1')
      .then((d) => setStorage(d.configured))
      .catch(() => {});
  }, []);
  useEffect(() => {
    setRows(data.products as unknown as ProductRecord[]);
  }, [data.products]);
  useEffect(() => {
    setPage(1);
  }, [search, category, status, location, perPage]);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get('module')==='products'&&Number(params.get('record')))open(Number(params.get('record'))).catch(e=>setMessage(e.message));},[]);
  async function open(id: number) {
    setMessage('');
    try {
      setDetail(await jsonRequest(`/api/products?id=${id}`));
      setSelectedId(id);
      setTab('Summary');
      setForm(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Product unavailable.');
    }
  }
  async function perform(p: ProductRecord, name: string) {
    setMessage('');
    if (name === 'Edit Product') {
      setForm({ product: p, parent: rows.find((r) => r.id === p.parent_id) });
      setFormKey((k) => k + 1);
      return;
    }
    if (name === 'Add Variation') {
      setForm({ parent: p });
      setFormKey((k) => k + 1);
      return;
    }
    if (name === 'Manufacture Product') {
      onManufacture(p);
      return;
    }
    setAction({ product: p, name });
  }
  async function lineAction(name: string, row: Row) {
    if (!detail) return;
    setBusy(true);
    try {
      await jsonRequest('/api/products/actions', {
        id: detail.product.id,
        action: name,
        line_id: Number(row.id),
      });
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Inventory action failed.');
    } finally {
      setBusy(false);
    }
  }
  const filtered = useMemo(
    () =>
      filterProducts(rows,new URLSearchParams({search,category,status,location}))
        .sort((a, b) => {
          const av = a[sort as keyof ProductRecord] ?? '';
          const bv = b[sort as keyof ProductRecord] ?? '';
          return (
            (typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv))) * (descending ? -1 : 1)
          );
        }),
    [rows, search, category, status, location, sort, descending],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const shown = filtered.slice(
    (Math.min(page, pageCount) - 1) * perPage,
    Math.min(page, pageCount) * perPage,
  );
  const exportUrl = (print = false) => {
    const params = new URLSearchParams({
      report,
      search,
      category,
      status,
      location,
    });
    if (print) params.set('format', 'print');
    if (report === 'custom') params.set('columns', customColumns.join(','));
    if (selection.length) params.set('ids', selection.join(','));
    return `/api/products/export?${params}`;
  };
  async function bulk(action: string) {
    if (!selection.length) return;
    if (
      !window.confirm(
        `${action === 'archive' ? 'Archive' : 'Restore'} ${selection.length} selected products? History will be retained.`,
      )
    )
      return;
    try {
      await jsonRequest('/api/products/bulk', {
        ids: selection,
        action,
        confirm: true,
      });
      setSelection([]);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Bulk action failed.');
    }
  }
  async function csvAction(confirm = false) {
    setBusy(true);
    try {
      const result = await jsonRequest('/api/products/import', {
        csv,
        confirm,
        preview_hash: importPreview?.hash,
        mode: importMode,
        opening_balances: opening,
      });
      if (!confirm) setImportPreview(result);
      else {
        setImporting(false);
        setImportPreview(null);
        setCsv('');
        setMessage(
          `Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`,
        );
        await refresh();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }
  async function imageUpload(file: File, replace?: number) {
    if (!detail) return;
    setBusy(true);
    try {
      if (replace && !window.confirm('Replace this saved image?')) return;
      const body = new FormData();
      body.set('product_id', String(detail.product.id));
      body.set('file', file);
      const response = await fetch('/api/products/images', {
        method: 'POST',
        body,
      });
      if (!response.ok) throw Error((await response.json()).error);
      if (replace) {
        const fresh = await jsonRequest(
          `/api/products?id=${detail.product.id}`,
        );
        const newId = fresh.product.images.at(-1)?.id;
        if (
          detail.product.images?.find((i) => i.id === replace)?.is_primary &&
          newId
        )
          await jsonRequest(
            '/api/products/images',
            { product_id: detail.product.id, image_id: newId },
            'PATCH',
          );
        await jsonRequest(
          '/api/products/images',
          { product_id: detail.product.id, image_id: replace, confirm: true },
          'DELETE',
        );
      }
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Image upload failed.');
    } finally {
      setBusy(false);
    }
  }
  const p = detail?.product;
  const recipes = data.recipes.filter((r) => r.product_id === p?.id);
  const recipe = recipes.find((r) => r.id === recipeId) ?? recipes[0];
  const plan = recipe ? planProduction(recipe, data.materials) : null;
  const price =
    p && plan
      ? pricing(plan.costPerUnit, p.retail_price, markup, margin, pricingMethod)
      : null;
  const cell = (p: ProductRecord, column: string) =>
    column === 'Product Image' ? (
      p.image_id||p.image_url ? (
        <Image
          unoptimized
          width={48}
          height={48}
          className="h-12 w-12 rounded-lg object-cover"
          src={p.image_id?`/api/products/images?id=${p.image_id}`:p.image_url!}
          alt={p.name}
        />
      ) : (
        <span className="text-xs text-[#868F9E]">No image</span>
      )
    ) : column === 'Product Name' ? (
      <button
        className="text-left font-semibold underline-offset-2 hover:underline"
        onClick={() => open(p.id)}
      >
        {p.name}
        {p.parent_id && (
          <span className="block text-xs font-normal text-[#868F9E]">
            Variation of {rows.find((r) => r.id === p.parent_id)?.name}
          </span>
        )}
      </button>
    ) : column === 'SKU' ? (
      p.sku
    ) : column === 'Category' ? (
      p.category
    ) : column === 'On Hand' ? (
      p.stock_quantity
    ) : column === 'Available' ? (
      p.available
    ) : column === 'Low Stock Limit' ? (
      p.reorder_threshold
    ) : column === 'Sale Price' ? (
      dollars(p.retail_price)
    ) : p.archived_at ? (
      'Archived'
    ) : (
      p.state
    );
  return (
    <div className="space-y-5">
      {message && (
        <p role="status" className="rounded-xl bg-[#E8C9C9] p-4">
          {message}
        </p>
      )}
      {form ? (
        <ProductForm
          key={formKey}
          product={form.product}
          parent={form.parent}
          onCancel={() => setForm(null)}
          onSaved={(id, another) => {
            if (another) {
              setForm({});
              setFormKey((k) => k + 1);
              refresh();
            } else {
              setForm(null);
              open(id);
              refresh(id);
            }
          }}
        />
      ) : p ? (
        <>
          <section className="card space-y-4 rounded-3xl p-5">
            <button
              className="text-sm underline"
              onClick={() => {
                setSelectedId(null);
                setDetail(null);
              }}
            >
              ← Products
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {(p.image_id||p.image_url) && (
                  <Image
                    unoptimized
                    width={80}
                    height={80}
                    className="h-20 w-20 rounded-xl object-cover"
                    src={`/api/products/images?id=${p.image_id}`}
                    alt={p.name}
                  />
                )}
                <div>
                  <h3 className="text-2xl font-semibold">{p.name}</h3>
                  <p className="text-sm text-[#868F9E]">
                    {p.sku} · {p.archived_at ? 'Archived' : p.state}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  className={buttonClass}
                  onClick={() => perform(p, 'Edit Product')}
                >
                  Edit Product
                </button>
                <ProductMenu onAction={(a) => perform(p, a)} />
              </div>
            </div>
            <nav
              className="flex flex-wrap gap-2"
              aria-label="Product detail tabs"
            >
              {tabs.map((t) => (
                <button
                  key={t}
                  className={`rounded-xl px-3 py-2 text-sm ${tab === t ? 'bg-[#000E2D] text-white' : 'bg-[#F4EAE8]'}`}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </nav>
          </section>
          <section className="card space-y-5 rounded-3xl p-5">
            {tab === 'Summary' && (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['SKU', p.sku],
                    ['On Hand', p.stock_quantity],
                    ['Reserved', p.reserved],
                    ['Available', p.available],
                    ['Consigned', p.consigned],
                    ['Category', p.category],
                    ['State', p.state],
                    ['Auto manufacture', p.auto_manufacture ? 'Yes' : 'No'],
                    ['Sale price', dollars(p.retail_price)],
                    ['Wholesale price', dollars(p.wholesale_price)],
                    ['Low stock limit', p.reorder_threshold],
                    [
                      'Inventory value',
                      dollars(p.stock_quantity * p.cost_per_unit),
                    ],
                    ['Measurement type', p.measurement_type],
                    ['Default location', p.location],
                    ['Sale quantity', p.sale_quantity],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-[#F4EAE8] p-4">
                      <p className="text-sm text-[#868F9E]">{k}</p>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <p>{p.description}</p>
                <section className="space-y-3">
                  <h4 className="text-lg font-semibold">Product images</h4>
                  {!storage && (
                    <p className="text-sm">
                      Persistent image storage is not configured.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-4">
                    {p.images?.map((i) => (
                      <div
                        key={i.id}
                        className="space-y-2 rounded-xl border p-3"
                      >
                        <Image
                          unoptimized
                          width={144}
                          height={144}
                          className="h-36 w-36 rounded-xl object-cover"
                          src={`/api/products/images?id=${i.id}`}
                          alt={p.name}
                        />
                        <p className="text-sm">
                          {i.is_primary ? 'Primary image' : ''}
                        </p>
                        <div className="flex flex-wrap gap-3 text-sm">
                          <button
                            disabled={busy || !!i.is_primary}
                            onClick={async () => {
                              try {
                                await jsonRequest(
                                  '/api/products/images',
                                  { product_id: p.id, image_id: i.id },
                                  'PATCH',
                                );
                                await refresh();
                              } catch (e) {
                                setMessage(String(e));
                              }
                            }}
                          >
                            Set primary
                          </button>
                          <label className="cursor-pointer underline">
                            Replace
                            <input
                              type="file"
                              className="sr-only"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={!storage || busy}
                              onChange={(e) => {
                                if (e.target.files?.[0])
                                  imageUpload(e.target.files[0], i.id);
                              }}
                            />
                          </label>
                          <button
                            className="text-red-700"
                            aria-label={`Remove image ${i.id}`}
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  'Remove this product image? Shared images used by copies will be retained.',
                                )
                              )
                                return;
                              try {
                                await jsonRequest(
                                  '/api/products/images',
                                  {
                                    product_id: p.id,
                                    image_id: i.id,
                                    confirm: true,
                                  },
                                  'DELETE',
                                );
                                await refresh();
                              } catch (e) {
                                setMessage(String(e));
                              }
                            }}
                          >
                            🗑 Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (storage && e.dataTransfer.files[0])
                        imageUpload(e.dataTransfer.files[0]);
                    }}
                    className="rounded-xl border-2 border-dashed p-4"
                  >
                    <label className="grid gap-2">
                      Add image or drop a file
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={!storage || busy}
                        onChange={(e) => {
                          if (e.target.files?.[0])
                            imageUpload(e.target.files[0]);
                        }}
                      />
                    </label>
                  </div>
                </section>
                <section className="space-y-3 rounded-xl border p-4">
                  <div className="flex flex-wrap justify-between gap-3">
                    <h4 className="text-lg font-semibold">
                      Recipes and manufacturing cost
                    </h4>
                    <button
                      className={buttonClass}
                      onClick={() => onRecipes(p)}
                    >
                      Open Recipe Builder
                    </button>
                  </div>
                  {recipes.length ? (
                    <>
                      <label className="grid gap-1">
                        Recipe version
                        <select
                          className={inputClass}
                          value={recipe?.id}
                          onChange={(e) => setRecipeId(Number(e.target.value))}
                        >
                          {recipes.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} · v{r.version}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p>
                        Batch yield {recipe?.batch_yield} · Batch cost{' '}
                        {dollars(plan?.totalBatchCost ?? 0)} · Cost per unit{' '}
                        {dollars(plan?.costPerUnit ?? 0)}
                      </p>
                      <p className="text-sm">
                        Manufacturing history preserves the recipe and costs
                        used for each completed batch.
                      </p>
                      <button
                        className={buttonClass}
                        onClick={() => onManufacture(p)}
                      >
                        Manufacture Product
                      </button>
                    </>
                  ) : (
                    <p>No recipe associated with this product yet.</p>
                  )}
                </section>
                {price && (
                  <section className="space-y-3 rounded-xl bg-[#F4EAE8] p-4">
                    <h4 className="text-lg font-semibold">Pricing guidance</h4>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label>
                        Markup (%)
                        <input
                          className={inputClass}
                          min="0"
                          type="number"
                          value={markup}
                          onChange={(e) => setMarkup(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Target margin (%)
                        <input
                          className={inputClass}
                          min="0"
                          max="99.99"
                          type="number"
                          value={margin}
                          onChange={(e) => setMargin(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Pricing method
                        <select
                          className={inputClass}
                          value={pricingMethod}
                          onChange={(e) => setPricingMethod(e.target.value)}
                        >
                          <option value="markup">Markup on cost</option>
                          <option value="margin">Gross margin on price</option>
                        </select>
                      </label>
                    </div>
                    <p>
                      Current gross profit {dollars(price.profit)} · Margin{' '}
                      {price.margin.toFixed(1)}% · Suggested retail{' '}
                      {price.suggested === null
                        ? 'Invalid target margin'
                        : dollars(price.suggested)}{' '}
                      · Wholesale (100% markup) {dollars(price.wholesale)}
                    </p>
                    <p className="text-sm">
                      Guidance does not change product prices or Shopify data.
                    </p>
                  </section>
                )}
                <h4 className="text-lg font-semibold">Product history</h4>
                <HistoryTable
                  rows={detail!.events}
                  fields={[
                    ['created_at', 'When'],
                    ['kind', 'Event'],
                    ['details', 'Details'],
                  ]}
                />
              </>
            )}
            {tab === 'Variations' && (
              <>
                <div className="flex flex-wrap gap-3">
                  <button
                    className={buttonClass}
                    onClick={() => perform(p, 'Add Variation')}
                  >
                    Add Variation
                  </button>
                  <button
                    className={buttonClass}
                    onClick={() => perform(p, 'Manage Variation Attributes')}
                  >
                    Manage Variation Attributes
                  </button>
                </div>
                {detail!.variations.length ? (
                  detail!.variations.map((v) => (
                    <article
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                      key={v.id}
                    >
                      <div>
                        {v.image_id && (
                          <Image
                            unoptimized
                            width={64}
                            height={64}
                            className="h-16 w-16 rounded-xl object-cover"
                            src={`/api/products/images?id=${v.image_id}`}
                            alt={v.name}
                          />
                        )}
                        <button
                          className="font-semibold underline"
                          onClick={() => open(v.id)}
                        >
                          {v.name} · {v.sku}
                        </button>
                        <p className="text-sm">
                          {Object.entries(JSON.parse(v.attributes))
                            .map(([k, val]) => `${k}: ${val}`)
                            .join(' · ')}{' '}
                          · Available {v.available} · {dollars(v.retail_price)}{' '}
                          retail · {dollars(v.wholesale_price)} wholesale
                        </p>
                      </div>
                      <ProductMenu onAction={(a) => perform(v, a)} />
                    </article>
                  ))
                ) : (
                  <p>No variations yet.</p>
                )}
              </>
            )}
            {tab === 'Manufactures' && (
              <HistoryTable
                rows={detail!.manufactures}
                fields={[
                  ['id', 'Batch'],
                  ['recipe_id', 'Recipe'],
                  ['status', 'Status'],
                  ['planned_quantity', 'Planned'],
                  ['completed_quantity', 'Completed'],
                  ['actual_cost', 'Actual cost'],
                  ['created_at', 'Created'],
                ]}
              />
            )}
            {tab === 'Orders' && (
              <>
                <button
                  className={buttonClass}
                  onClick={() => perform(p, 'Add Order')}
                >
                  Add Order
                </button>
                <HistoryTable
                  rows={detail!.orders}
                  fields={[
                    ['order_id', 'Order'],
                    ['customer', 'Customer'],
                    ['quantity', 'Quantity'],
                    ['unit_price', 'Unit price'],
                    ['location', 'Location'],
                    ['status', 'Status'],
                  ]}
                  action={(r) =>
                    !r.fulfilled && r.status !== 'Cancelled' ? (
                      <button
                        disabled={busy}
                        className={buttonClass}
                        onClick={() => lineAction('fulfill', r)}
                      >
                        Fulfill
                      </button>
                    ) : null
                  }
                />
              </>
            )}
            {tab === 'Purchases' && (
              <>
                <button
                  className={buttonClass}
                  onClick={() => perform(p, 'Add Purchase')}
                >
                  Add Purchase
                </button>
                <HistoryTable
                  rows={detail!.purchases}
                  fields={[
                    ['purchase_id', 'Purchase'],
                    ['supplier', 'Supplier'],
                    ['quantity', 'Quantity'],
                    ['unit_cost', 'Unit cost'],
                    ['location', 'Location'],
                    ['status', 'Status'],
                  ]}
                  action={(r) =>
                    !r.received && r.status !== 'Cancelled' ? (
                      <button
                        disabled={busy}
                        className={buttonClass}
                        onClick={() => lineAction('receive', r)}
                      >
                        Receive
                      </button>
                    ) : null
                  }
                />
              </>
            )}
            {tab === 'Listings' && (
              <ShopifyPanel product={p} onSaved={() => refresh()} />
            )}
            {tab === 'Locations' && (
              <>
                <button
                  className={buttonClass}
                  onClick={() => perform(p, 'Transfer Stock')}
                >
                  Transfer Stock
                </button>
                <HistoryTable
                  rows={detail!.locations}
                  fields={[
                    ['location', 'Location'],
                    ['quantity', 'On hand'],
                    ['consigned', 'Consigned'],
                  ]}
                />
              </>
            )}
            {tab === 'Adjustments' && (
              <>
                <button
                  className={buttonClass}
                  onClick={() => perform(p, 'Add Adjustment')}
                >
                  Add Adjustment
                </button>
                <HistoryTable
                  rows={detail!.ledger}
                  fields={[
                    ['created_at', 'When'],
                    ['kind', 'Movement'],
                    ['location', 'Location'],
                    ['delta', 'Change'],
                    ['balance', 'Balance'],
                    ['reason', 'Reason'],
                    ['reference_type', 'Reference type'],
                    ['reference_id', 'Reference'],
                  ]}
                />
              </>
            )}
            {tab === 'Stocktakes' && (
              <>
                <button
                  className={buttonClass}
                  onClick={() => perform(p, 'Stocktake')}
                >
                  Record Stocktake
                </button>
                <HistoryTable
                  rows={detail!.stocktakes}
                  fields={[
                    ['created_at', 'When'],
                    ['location', 'Location'],
                    ['system_quantity', 'System'],
                    ['actual_quantity', 'Physical'],
                    ['variance', 'Variance'],
                    ['reason', 'Reason'],
                  ]}
                />
              </>
            )}
            {tab === 'Push Activity' && (
              <HistoryTable
                rows={detail!.pushes}
                fields={[
                  ['created_at', 'When'],
                  ['operation', 'Operation'],
                  ['status', 'Status'],
                  ['local_quantity', 'Local'],
                  ['remote_quantity', 'Remote'],
                  ['result', 'Result / error'],
                ]}
              />
            )}
          </section>
        </>
      ) : (
        <section className="card space-y-5 rounded-3xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold">Products</h3>
              <p className="text-sm text-[#868F9E]">
                {filtered.length} products and variations
              </p>
            </div>
            <div className="flex gap-3">
              <button
                className="rounded-xl border px-4 py-2.5"
                onClick={() => {
                  setAdvancedImport(true);
                  setMessage('');
                }}
              >
                Import Products
              </button>
              <button
                className={buttonClass}
                onClick={() => {
                  setForm({});
                  setFormKey((k) => k + 1);
                }}
              >
                + Add Product
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm">
              Search
              <input
                className={inputClass}
                placeholder="Product name or SKU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Category
              <select
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {[...new Set(rows.map((r) => r.category))].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Stock status
              <select
                className={inputClass}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="active">Active records</option>
                <option value="in">In Stock</option>
                <option value="low">Low Stock</option>
                <option value="out">Out of Stock</option>
                <option value="archived">Archived</option>
                <option value="all">All records</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Location
              <select
                className={inputClass}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                <option value="">All locations</option>
                {[...new Set(rows.flatMap(r => r.locations?.map(l => l.location) ?? [r.location]))].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label>
              Sort by
              <select
                className="ml-2 rounded-lg border p-2"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="name">Name</option>
                <option value="sku">SKU</option>
                <option value="category">Category</option>
                <option value="stock_quantity">On hand</option>
                <option value="available">Available</option>
                <option value="retail_price">Sale price</option>
                <option value="reorder_threshold">Low stock limit</option>
              </select>
            </label>
            <button
              className="rounded-lg border p-2"
              onClick={() => setDescending(!descending)}
            >
              {descending ? 'Descending' : 'Ascending'}
            </button>
            <details className="rounded-lg border p-2">
              <summary className="cursor-pointer">Column visibility</summary>
              <div className="grid gap-2 p-2">
                {columns.map((c) => (
                  <label key={c} className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={visible.includes(c)}
                      onChange={(e) =>
                        setVisible(
                          e.target.checked
                            ? [...visible, c]
                            : visible.filter((v) => v !== c),
                        )
                      }
                    />
                    {c}
                  </label>
                ))}
              </div>
            </details>
            {selection.length > 0 && (
              <>
                <span>{selection.length} selected</span>
                <button
                  className="text-red-700 underline"
                  onClick={() => bulk('archive')}
                >
                  Archive selected
                </button>
                <button className="underline" onClick={() => bulk('restore')}>
                  Restore selected
                </button>
                <button className="underline" onClick={() => setSelection([])}>
                  Clear selection
                </button>
              </>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-3">
                    <input
                      aria-label="Select page"
                      type="checkbox"
                      checked={
                        !!shown.length &&
                        shown.every((p) => selection.includes(p.id))
                      }
                      onChange={(e) =>
                        setSelection(
                          e.target.checked
                            ? [
                                ...new Set([
                                  ...selection,
                                  ...shown.map((p) => p.id),
                                ]),
                              ]
                            : selection.filter(
                                (id) => !shown.some((p) => p.id === id),
                              ),
                        )
                      }
                    />
                  </th>
                  {columns
                    .filter((c) => visible.includes(c))
                    .map((c) => (
                      <th className="whitespace-nowrap p-3" key={c}>
                        {c}
                      </th>
                    ))}
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="border-t border-[#F4EAE8]">
                    <td className="p-3">
                      <input
                        aria-label={`Select ${p.sku}`}
                        type="checkbox"
                        checked={selection.includes(p.id)}
                        onChange={(e) =>
                          setSelection(
                            e.target.checked
                              ? [...selection, p.id]
                              : selection.filter((id) => id !== p.id),
                          )
                        }
                      />
                    </td>
                    {columns
                      .filter((c) => visible.includes(c))
                      .map((c) => (
                        <td key={c} className="p-3">
                          {cell(p, c)}
                        </td>
                      ))}
                    <td className="p-3">
                      <ProductMenu onAction={(a) => perform(p, a)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!shown.length && (
            <p className="p-4 text-[#868F9E]">
              No products match the current filters.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label>
              Results per page
              <select
                className="ml-2 rounded-lg border p-2"
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
              >
                {[25, 50, 100].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-4">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                Page {Math.min(page, pageCount)} of {pageCount}
              </span>
              <button
                disabled={page >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <label>
                Export / report
                <select
                  className="ml-2 rounded-lg border p-2"
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                >
                  <option value="worksheet">Product Inventory Worksheet</option>
                  <option value="prices">Product Price List</option>
                  <option value="stock">Product Stock Report</option>
                  <option value="custom">Custom Product CSV Export</option>
                </select>
              </label>
              <a className={buttonClass} href={exportUrl()}>
                CSV Export
              </a>
              <a
                className="rounded-xl border px-4 py-2.5 text-sm"
                href={exportUrl(true)}
                target="_blank"
                rel="noreferrer"
              >
                Printable Report
              </a>
            </div>
            {report === 'custom' && (
              <div className="flex flex-wrap gap-3">
                {exportOptions.map((c) => (
                  <label className="flex gap-2 text-sm" key={c}>
                    <input
                      type="checkbox"
                      checked={customColumns.includes(c)}
                      onChange={(e) =>
                        setCustomColumns(
                          e.target.checked
                            ? [...customColumns, c]
                            : customColumns.filter((x) => x !== c),
                        )
                      }
                    />
                    {c}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-[#868F9E]">
              Reports use current filters and selected rows when a selection is
              active.
            </p>
          </div>
        </section>
      )}
      {action && (
        <ProductActionDialog
          key={`${action.product.id}:${action.name}`}
          product={action.product}
          action={action.name}
          products={rows}
          onClose={() => setAction(null)}
          onSaved={(id) => {
            refresh(id ?? selectedId);
          }}
        />
      )}
      {advancedImport&&<ImportWizard kind='products' onClose={()=>setAdvancedImport(false)} onSaved={async()=>{await refresh();onRefresh();}}/>}
      {importing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bulk Import"
          className="fixed inset-0 z-40 overflow-y-auto bg-[#000E2D]/40 p-4 sm:p-8"
        >
          <section className="mx-auto max-w-4xl space-y-4 rounded-3xl bg-white p-5">
            <div className="flex justify-between">
              <h3 className="text-xl font-semibold">Bulk Import Products</h3>
              <button onClick={() => setImporting(false)}>Close</button>
            </div>
            <a className="underline" href="/api/products/import">
              Download CSV Template
            </a>
            <label className="grid gap-2">
              Upload CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setCsv(await file.text());
                    setImportPreview(null);
                  }
                }}
              />
            </label>
            <label className="grid gap-2">
              Existing SKU matches
              <select
                className={inputClass}
                value={importMode}
                onChange={(e) => { setImportMode(e.target.value); setImportPreview(null); }}
              >
                <option value="skip">Skip existing products</option>
                <option value="update">Update eligible product fields</option>
              </select>
            </label>
            <p className="text-sm">
              Existing inventory balances and unit costs are never overwritten
              by product import. Archived matches must be restored before
              updating.
            </p>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={opening}
                onChange={(e) => { setOpening(e.target.checked); setImportPreview(null); }}
              />
              Explicit opening inventory import: apply starting quantities to
              NEW products through opening ledger adjustments.
            </label>
            <button
              className={buttonClass}
              disabled={!csv || busy}
              onClick={() => csvAction()}
            >
              Validate and Preview
            </button>
            {importPreview && (
              <>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr>
                        {[
                          'Row',
                          'Product',
                          'SKU',
                          'Match',
                          'Opening',
                          'Validation',
                        ].map((c) => (
                          <th className="p-2" key={c}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((r) => (
                        <tr key={r.row} className="border-t">
                          <td className="p-2">{r.row}</td>
                          <td>{r.name}</td>
                          <td>{r.sku}</td>
                          <td>
                            {r.match_id
                              ? `Existing #${r.match_id}${r.archived ? ' (archived)' : ''}`
                              : 'New'}
                          </td>
                          <td>
                            {opening && !r.match_id ? r.opening_quantity : 0}
                          </td>
                          <td className={r.errors.length ? 'text-red-700' : ''}>
                            {r.errors.join('; ') || 'Valid'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  className={buttonClass}
                  disabled={
                    busy || importPreview.rows.some((r) => r.errors.length > 0)
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        'Confirm importing the previewed products?',
                      )
                    )
                      csvAction(true);
                  }}
                >
                  Confirm Import
                </button>
              </>
            )}
            {message && <p role="alert">{message}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
