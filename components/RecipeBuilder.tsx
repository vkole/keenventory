'use client';
import { useEffect, useState } from 'react';
import type { DashboardData, Recipe } from '@/lib/data';
import {
  planProduction,
  pricing,
  type Ingredient,
  type Stock,
} from '@/lib/production';

const dollars = (n: number | null) =>
  n === null
    ? 'Unavailable'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(n);
const field =
  'w-full rounded-xl border border-[#E2E1E2] bg-white p-3 text-[#000E2D]';
const button =
  'rounded-xl bg-[#000E2D] px-4 py-3 text-white disabled:opacity-50';
export type EditableRecipe = Recipe & {
  product_variant?: string;
  measurement_unit?: string;
  labor_mode?: string;
  labor_reference_yield?: number;
  overhead?: number;
};
export function RecipeBuilder({
  data,
  onRefresh,
  onManufacture,
  productId,
}: {
  productId?: number;
  data: DashboardData;
  onRefresh: () => void;
  onManufacture: (r: EditableRecipe, count: number) => void;
}) {
  const empty = () => ({
    id: undefined as number | undefined,
    name: '',
    product_id: productId ?? data.products.find(p => !p.archived_at && p.state === 'Active')?.id ?? 0,
    version: 1,
    product_variant: '',
    measurement_unit: 'candles',
    batch_yield: 12,
    batch_minutes: 45,
    hourly_labor_rate: 12,
    labor_mode: 'fixed',
    labor_reference_yield: 12,
    overhead: 0,
    status: 'Draft',
    instructions: '',
    notes: '',
    ingredients: [] as Ingredient[],
  });
  const [form, setForm] = useState(empty);
  const [stock, setStock] = useState<Stock[]>(data.materials);
  const [retail, setRetail] = useState(data.products[0]?.retail_price ?? 0);
  const [markup, setMarkup] = useState(150);
  const [margin, setMargin] = useState(50);
  const [method, setMethod] = useState('margin');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newMaterial, setNewMaterial] = useState({
    name: '',
    sku: '',
    unit: 'oz',
    cost_per_unit: 0,
    stock_quantity: 0,
    category: 'Candle Wax',
  });
  async function refreshStock() {
    const response = await fetch('/api/manufacturing', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not refresh inventory.');
    setStock((await response.json()).materials);
  }
  useEffect(() => {
    refreshStock().catch((e) => setMessage(e.message));
  }, [data.materials]);
  const plan = planProduction(form, stock);
  const prices = pricing(plan.costPerUnit, retail, markup, margin, method);
  const numberField = (
    label: string,
    value: number,
    change: (n: number) => void,
    min = 0,
    step: number | string = 'any',
  ) => (
    <label className="grid gap-1 text-sm">
      {label}
      <input
        className={field}
        type="number"
        required
        min={min}
        step={step}
        value={value}
        onChange={(e) => change(Number(e.target.value))}
      />
    </label>
  );
  function open(r: EditableRecipe, duplicate = false) {
    setForm({
      ...empty(),
      ...r,
      id: duplicate ? undefined : r.id,
      name: duplicate ? `${r.name} (copy)` : r.name,
      version: duplicate ? r.version + 1 : r.version,
      product_id: r.product_id ?? 0,
      notes: r.notes ?? '',
      product_variant: r.product_variant ?? '',
      measurement_unit: r.measurement_unit ?? 'candles',
      labor_mode: r.labor_mode ?? 'fixed',
      labor_reference_yield: r.labor_reference_yield ?? r.batch_yield,
      overhead: r.overhead ?? 0,
      ingredients: r.ingredients.map((i) => ({ ...i })),
    });
    setRetail(
      data.products.find((p) => p.id === r.product_id)?.retail_price ?? 0,
    );
    setMessage('');
  }
  async function save(action: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setForm((current) => ({ ...current, id: body.id }));
      onRefresh();
      if (action === 'another') setForm(empty());
      if (action === 'manufacture')
        onManufacture(
          {
            ...form,
            id: body.id,
            is_active: form.status === 'Active',
            created_at: new Date().toISOString(),
          },
          form.batch_yield,
        );
      setMessage('Recipe saved. Inventory has not been deducted.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to save recipe.');
    } finally {
      setBusy(false);
    }
  }
  async function createMaterial() {
    setBusy(true);
    try {
      if (!newMaterial.name.trim() || !newMaterial.sku.trim())
        throw new Error('Enter a material name and SKU.');
      const response = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMaterial),
      });
      if (!response.ok)
        throw new Error(
          'Material could not be created. Check the SKU is unique.',
        );
      await refreshStock();
      onRefresh();
      setShowNew(false);
      setMessage('Inventory item created. Select it in an ingredient row.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to create material.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <section className="card rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Recipe library</h3>
          <button
            className={button}
            onClick={() => {
              setForm(empty());
              setMessage('');
            }}
          >
            Create Recipe
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {data.recipes.map((r) => (
            <div className="rounded-xl border p-4" key={r.id}>
              <strong>
                {r.name} · v{r.version}
              </strong>
              <p className="text-sm text-[#868F9E]">
                {data.products.find((p) => p.id === r.product_id)?.name} ·{' '}
                {r.batch_yield} candles
              </p>
              <div className="mt-2 flex flex-wrap gap-4">
                <button onClick={() => open(r)}>Edit</button>
                <button onClick={() => open(r, true)}>Duplicate Recipe</button>
                <button onClick={() => onManufacture(r, r.batch_yield)}>
                  Create Manufacturing Batch
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <form
        className="card space-y-6 rounded-3xl p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save(
            (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ??
              'save',
          );
        }}
      >
        <h3 className="text-xl font-semibold">
          {form.id ? 'Edit Recipe' : 'New Recipe'}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label>
            Recipe name
            <input
              required
              className={field}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Associated product
            <select
              required
              className={field}
              value={form.product_id}
              onChange={(e) => {
                const id = Number(e.target.value);
                setForm({ ...form, product_id: id });
                setRetail(
                  data.products.find((p) => p.id === id)?.retail_price ?? 0,
                );
              }}
            >
              {data.products.filter(p => !p.archived_at && p.state === 'Active').map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Product variant
            <input
              className={field}
              value={form.product_variant}
              onChange={(e) =>
                setForm({ ...form, product_variant: e.target.value })
              }
            />
          </label>
          {numberField(
            'Recipe version',
            form.version,
            (n) => setForm({ ...form, version: n }),
            1,
            1,
          )}
          {numberField(
            'Batch yield',
            form.batch_yield,
            (n) => setForm({ ...form, batch_yield: n }),
            1,
            1,
          )}
          <label>
            Measurement unit
            <input
              required
              className={field}
              value={form.measurement_unit}
              onChange={(e) =>
                setForm({ ...form, measurement_unit: e.target.value })
              }
            />
          </label>
          <label>
            Labor model
            <select
              className={field}
              value={form.labor_mode}
              onChange={(e) => setForm({ ...form, labor_mode: e.target.value })}
            >
              <option value="fixed">Fixed batch time</option>
              <option value="per_unit">Minutes per candle</option>
              <option value="scaled">Scale from reference yield</option>
            </select>
          </label>
          {numberField('Estimated minutes', form.batch_minutes, (n) =>
            setForm({ ...form, batch_minutes: n }),
          )}
          {form.labor_mode === 'scaled' &&
            numberField(
              'Reference batch yield',
              form.labor_reference_yield,
              (n) => setForm({ ...form, labor_reference_yield: n }),
              1,
              1,
            )}
          {numberField('Hourly labor rate ($)', form.hourly_labor_rate, (n) =>
            setForm({ ...form, hourly_labor_rate: n }),
          )}
          {numberField('Batch overhead ($)', form.overhead, (n) =>
            setForm({ ...form, overhead: n }),
          )}
          <label>
            Status
            <select
              className={field}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option>Draft</option>
              <option>Active</option>
              <option>Archived</option>
            </select>
          </label>
        </div>
        <p className="text-sm text-[#868F9E]">
          Quantities are per candle. Costs use the current inventory unit cost;
          edit costs through inventory. Units must match the inventory tracking
          unit.
        </p>
        <datalist id="recipe-inventory">
          {stock.map((m) => (
            <option key={m.id} value={m.name}>
              {m.unit} · {dollars(m.cost_per_unit)}
            </option>
          ))}
        </datalist>
        {['material', 'component'].map((type) => (
          <section key={type} className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">
                {type === 'material' ? 'Material ingredients' : 'Components'}
              </h4>
              <button
                type="button"
                className={button}
                onClick={() =>
                  setForm({
                    ...form,
                    ingredients: [
                      ...form.ingredients,
                      {
                        item_name: '',
                        quantity: 1,
                        unit: type === 'material' ? 'oz' : 'unit',
                        item_type: type,
                      },
                    ],
                  })
                }
              >
                Add {type === 'material' ? 'Material' : 'Component'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead>
                  <tr>
                    {[
                      'Inventory item',
                      'Qty / candle',
                      'Unit',
                      'Unit cost',
                      'Batch qty',
                      'Batch cost',
                      'Available',
                      '',
                    ].map((h) => (
                      <th className="p-2" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {form.ingredients.map((item, index) =>
                    item.item_type !== type ? null : (
                      <tr key={index} className="border-t">
                        <td className="p-2">
                          <input
                            aria-label={`${type} name ${index + 1}`}
                            required
                            list="recipe-inventory"
                            className={field}
                            value={item.item_name}
                            onChange={(e) => {
                              const m = stock.find(
                                (s) => s.name === e.target.value,
                              );
                              setForm({
                                ...form,
                                ingredients: form.ingredients.map((i, j) =>
                                  j !== index
                                    ? i
                                    : {
                                        ...i,
                                        item_name: e.target.value,
                                        material_id: m?.id,
                                        unit: m?.unit ?? i.unit,
                                      },
                                ),
                              });
                            }}
                          />
                          {!plan.lines[index].valid && (
                            <span className="text-red-700">
                              Select an existing inventory item
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          <input
                            aria-label={`Quantity per candle ${index + 1}`}
                            className={field}
                            type="number"
                            required
                            min="0.000001"
                            step="0.000001"
                            value={item.quantity}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                ingredients: form.ingredients.map((i, j) =>
                                  j === index
                                    ? { ...i, quantity: Number(e.target.value) }
                                    : i,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>{item.unit}</td>
                        <td>{dollars(plan.lines[index].unit_cost)}</td>
                        <td>{plan.lines[index].required}</td>
                        <td>{dollars(plan.lines[index].total)}</td>
                        <td>
                          {plan.availability.find(
                            (a) => a.id === plan.lines[index].material_id,
                          )?.available ?? 0}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() =>
                              setForm({
                                ...form,
                                ingredients: form.ingredients.filter(
                                  (_, j) => j !== index,
                                ),
                              })
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        <button
          type="button"
          className="underline"
          onClick={() => setShowNew(!showNew)}
        >
          Create new material or component here
        </button>
        {showNew && (
          <div className="grid gap-3 rounded-xl bg-[#F4EAE8] p-4 sm:grid-cols-3">
            <label>
              Name
              <input
                className={field}
                value={newMaterial.name}
                onChange={(e) =>
                  setNewMaterial({ ...newMaterial, name: e.target.value })
                }
              />
            </label>
            <label>
              SKU
              <input
                className={field}
                value={newMaterial.sku}
                onChange={(e) =>
                  setNewMaterial({ ...newMaterial, sku: e.target.value })
                }
              />
            </label>
            <label>
              Tracking unit
              <input
                className={field}
                value={newMaterial.unit}
                onChange={(e) =>
                  setNewMaterial({ ...newMaterial, unit: e.target.value })
                }
              />
            </label>
            <label>
              Inventory category
              <select
                className={field}
                value={newMaterial.category}
                onChange={(e) =>
                  setNewMaterial({ ...newMaterial, category: e.target.value })
                }
              >
                <option>Candle Wax</option>
                <option>Fragrance Oils</option>
                <option>Miscellaneous Materials</option>
                <option>Component</option>
              </select>
            </label>
            {numberField('Unit cost ($)', newMaterial.cost_per_unit, (n) =>
              setNewMaterial({ ...newMaterial, cost_per_unit: n }),
            )}
            {numberField('Opening stock', newMaterial.stock_quantity, (n) =>
              setNewMaterial({ ...newMaterial, stock_quantity: n }),
            )}
            <button
              type="button"
              disabled={busy}
              className={button}
              onClick={createMaterial}
            >
              Create inventory item
            </button>
          </div>
        )}
        <div
          aria-live="polite"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {[
            ['Total batch cost', dollars(plan.totalBatchCost)],
            ['Cost per candle', dollars(plan.costPerUnit)],
            ['Gross profit per candle', dollars(prices.profit)],
            ['Gross profit margin', `${prices.margin.toFixed(1)}%`],
          ].map(([label, value]) => (
            <div className="rounded-2xl bg-[#F4EAE8] p-5" key={label}>
              <p className="text-sm">{label}</p>
              <strong className="text-2xl">{value}</strong>
            </div>
          ))}
        </div>
        <p>
          Materials {dollars(plan.materialCost)} · Components{' '}
          {dollars(plan.componentCost)} · Labor {dollars(plan.laborCost)} (
          {plan.minutes} minutes) · Overhead {dollars(form.overhead)}
        </p>
        <section className="space-y-3 rounded-2xl border p-4">
          <h4 className="text-lg font-semibold">Pricing guidance</h4>
          <p className="text-sm">
            Markup is added to cost. Gross margin is profit as a share of
            selling price. These estimates do not change product or Shopify
            prices.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {numberField('Current retail price ($)', retail, setRetail)}
            {numberField('Desired markup (%)', markup, setMarkup)}
            <label>
              Target gross margin (%)
              <input
                className={field}
                type="number"
                min="0"
                max="99.99"
                step="any"
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value))}
              />
            </label>
            <label>
              Pricing method
              <select
                className={field}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="markup">Markup based</option>
                <option value="margin">Margin based</option>
              </select>
            </label>
          </div>
          <p>
            Manufacturing cost / unit: {dollars(plan.costPerUnit)} · Markup
            price: {dollars(prices.markupPrice)} · Margin price:{' '}
            {dollars(prices.marginPrice)}
          </p>
          <p>
            Suggested retail: <strong>{dollars(prices.suggested)}</strong> ·
            Suggested wholesale (100% markup): {dollars(prices.wholesale)} ·
            Estimated profit: {dollars(prices.estimatedProfit)} · Estimated
            margin: {prices.estimatedMargin.toFixed(1)}%
          </p>
        </section>
        <section className="space-y-3">
          <div className="flex flex-wrap justify-between gap-3">
            <h4 className="text-lg font-semibold">Inventory availability</h4>
            <button
              type="button"
              className={button}
              onClick={() =>
                refreshStock()
                  .then(() =>
                    setMessage(
                      'Production capacity checked against current inventory.',
                    ),
                  )
                  .catch((e) => setMessage(e.message))
              }
            >
              Check Production Capacity
            </button>
          </div>
          <p>
            Maximum producible: <strong>{plan.capacity} candles</strong> ·
            Limiting inventory:{' '}
            {plan.limiting.join(', ') || 'Select ingredients'}
          </p>
          {plan.hasShortage && (
            <p role="alert" className="rounded-xl bg-[#E8C9C9] p-3">
              The requested batch exceeds available inventory or includes an
              unrecognized ingredient.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    'Item',
                    'Required',
                    'On hand',
                    'Reserved',
                    'Available',
                    'Remaining',
                    'Status',
                  ].map((h) => (
                    <th key={h} className="p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.availability.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="p-2">
                      {a.name} ({a.unit})
                    </td>
                    <td>{a.required}</td>
                    <td>{a.stock_quantity}</td>
                    <td>{a.reserved_quantity}</td>
                    <td>{a.available}</td>
                    <td>{a.remaining}</td>
                    <td>
                      {a.shortage
                        ? 'Shortage'
                        : a.low
                          ? 'Low stock'
                          : 'Available'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <label className="grid gap-2">
          Manufacturing instructions
          <textarea
            className={field}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          />
        </label>
        <label className="grid gap-2">
          Recipe notes
          <textarea
            className={field}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        {message && (
          <p role="status" className="rounded-xl bg-[#F4EAE8] p-3">
            {message}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy || !form.ingredients.length}
            className={button}
            type="submit"
            value="save"
          >
            Save Recipe
          </button>
          <button
            disabled={busy || !form.ingredients.length}
            className={button}
            type="submit"
            value="another"
          >
            Save &amp; Add Another
          </button>
          <button
            type="button"
            className={button}
            onClick={() =>
              setForm({
                ...form,
                id: undefined,
                name: `${form.name} (copy)`,
                version: form.version + 1,
              })
            }
          >
            Duplicate Recipe
          </button>
          <button
            disabled={busy || plan.hasShortage || !form.ingredients.length}
            className={button}
            type="submit"
            value="manufacture"
          >
            Create Manufacturing Batch
          </button>
          <button
            type="button"
            className="rounded-xl border px-4"
            onClick={() => {
              setForm(empty());
              setMessage('');
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
