'use client';
import { useEffect, useState } from 'react';
import type { DashboardData } from '@/lib/data';
import type { EditableRecipe } from './RecipeBuilder';
import { planProduction, type Stock } from '@/lib/production';
import type { Snapshot } from '@/lib/manufacturing';
const field = 'rounded-xl border border-[#E2E1E2] bg-white p-3';
const button =
  'rounded-xl bg-[#000E2D] px-4 py-3 text-white disabled:opacity-50';
type Batch = {
  id: number;
  status: string;
  planned_quantity: number;
  completed_quantity: number;
  recipe_snapshot: string | null;
  actual_cost: number;
  actual_minutes: number;
  hourly_labor_rate: number;
  consumption: string | null;
};
export function ManufacturingPlanner({
  data,
  seed,
  onRefresh,
}: {
  data: DashboardData;
  seed: { recipe: EditableRecipe; count: number } | null;
  onRefresh: () => void;
}) {
  const [recipeId, setRecipeId] = useState(
    seed?.recipe.id ?? data.recipes[0]?.id ?? 0,
  );
  const [count, setCount] = useState(seed?.count ?? 12);
  const [stock, setStock] = useState<Stock[]>(data.materials);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [active, setActive] = useState<Batch | null>(null);
  const [actual, setActual] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [rate, setRate] = useState(0);
  const [consumption, setConsumption] = useState<
    { material_id: number; quantity: number }[]
  >([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState('');
  const [createPayload, setCreatePayload] = useState<{
    request_key: string;
    recipe_id: number;
    product_id: number | null;
    planned_quantity: number;
  } | null>(null);
  useEffect(() => {
    setRequestKey(crypto.randomUUID());
  }, []);
  async function refresh() {
    const response = await fetch('/api/manufacturing', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to refresh production data.');
    const result = await response.json();
    setStock(result.materials);
    setBatches(result.batches);
  }
  useEffect(() => {
    refresh().catch((e) => setMessage(e.message));
  }, [data]);
  const recipe = (data.recipes.find((r) => r.id === recipeId) ??
    (seed?.recipe.id === recipeId ? seed.recipe : undefined)) as
    EditableRecipe | undefined;
  const plan = recipe ? planProduction(recipe, stock, count) : null;
  function selectBatch(b: Batch) {
    if (!b.recipe_snapshot) {
      setMessage('This legacy batch has no recipe snapshot.');
      return;
    }
    const snapshot = JSON.parse(b.recipe_snapshot) as Snapshot;
    setActive(b);
    setActual(b.planned_quantity);
    setMinutes(snapshot.plan.minutes);
    setRate(snapshot.hourly_labor_rate);
    setConsumption(
      snapshot.plan.availability.map((a) => ({
        material_id: a.id,
        quantity: a.required,
      })),
    );
    setMessage('');
  }
  async function create() {
    if (!recipe || !requestKey) return;
    setBusy(true);
    setMessage('');
    const payload = createPayload ?? {
      request_key: requestKey,
      recipe_id: recipe.id,
      product_id: recipe.product_id,
      planned_quantity: count,
    };
    setCreatePayload(payload);
    try {
      const response = await fetch('/api/manufacturing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setCreatePayload(null);
        throw new Error(body.error);
      }
      setRequestKey(crypto.randomUUID());
      setCreatePayload(null);
      await refresh();
      onRefresh();
      setMessage(
        'Draft created. Inventory reserved; stock has not been deducted.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to create batch.');
    } finally {
      setBusy(false);
    }
  }
  async function complete() {
    if (!active) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/manufacturing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: active.id,
          actual_quantity: actual,
          actual_minutes: minutes,
          hourly_labor_rate: rate,
          consumption,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setActive(null);
      await refresh();
      onRefresh();
      setMessage(
        'Batch completed. Actual consumption and finished inventory recorded.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to complete batch.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="card space-y-4 rounded-3xl p-5">
        <h3 className="text-xl font-semibold">Manufacturing batches</h3>
        {batches.map((b) => {
          const snapshot = b.recipe_snapshot
            ? (JSON.parse(b.recipe_snapshot) as Snapshot)
            : null;
          return (
            <article key={b.id} className="space-y-2 rounded-xl border p-4">
              <strong>
                Batch #{b.id} · {b.status}
              </strong>
              <p>
                {snapshot?.name}{' '}
                {snapshot ? `· v${snapshot.version}` : 'Legacy batch'} · Planned{' '}
                {b.planned_quantity} · Completed {b.completed_quantity}
              </p>
              {snapshot && (
                <p className="text-sm">
                  Estimated cost ${snapshot.plan.totalBatchCost.toFixed(2)} ·{' '}
                  {b.status === 'Completed'
                    ? `Actual cost $${b.actual_cost.toFixed(2)} · ${b.actual_minutes} labor minutes`
                    : 'Inventory reserved'}
                </p>
              )}
              {b.status === 'Completed' && b.consumption && (
                <p className="text-sm">
                  Actual consumption:{' '}
                  {(
                    JSON.parse(b.consumption) as {
                      material_id: number;
                      quantity: number;
                    }[]
                  )
                    .map(
                      (c) =>
                        `${snapshot?.plan.availability.find((a) => a.id === c.material_id)?.name ?? c.material_id}: ${c.quantity}`,
                    )
                    .join(', ')}
                </p>
              )}
              {snapshot && b.status !== 'Completed' && (
                <button className={button} onClick={() => selectBatch(b)}>
                  Record actual production
                </button>
              )}
            </article>
          );
        })}
      </section>
      <div className="space-y-6">
        <form
          className="card space-y-4 rounded-3xl p-5"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <h3 className="text-xl font-semibold">Add Manufacture</h3>
          <label className="grid gap-2">
            Recipe version
            <select
              required
              disabled={!!createPayload}
              className={field}
              value={recipeId}
              onChange={(e) => setRecipeId(Number(e.target.value))}
            >
              {data.recipes.filter(r => data.products.some(p => p.id === r.product_id && !p.archived_at && p.state === 'Active')).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · v{r.version}
                </option>
              ))}
            </select>
          </label>
          <p>
            Associated product:{' '}
            {data.products.find((p) => p.id === recipe?.product_id)?.name ??
              'Select a recipe'}
          </p>
          <label className="grid gap-2">
            Manufacturing quantity
            <input
              required
              disabled={!!createPayload}
              className={field}
              type="number"
              min="1"
              step="1"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
          {plan && (
            <>
              <p>
                Capacity: {plan.capacity} candles · Limiting:{' '}
                {plan.limiting.join(', ')}
              </p>
              {plan.hasShortage && (
                <p role="alert" className="text-red-700">
                  Insufficient inventory for this batch.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th>Inventory</th>
                      <th>Required</th>
                      <th>Available</th>
                      <th>Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.availability.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2">
                          {a.name} ({a.unit})
                        </td>
                        <td>{a.required}</td>
                        <td>{a.available}</td>
                        <td>{a.remaining}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>Estimated batch cost: ${plan.totalBatchCost.toFixed(2)}</p>
            </>
          )}
          <button
            className={button}
            disabled={
              busy ||
              !recipe ||
              !requestKey ||
              (!createPayload && plan?.hasShortage)
            }
            type="submit"
          >
            {createPayload ? 'Retry batch creation' : 'Create Draft Batch'}
          </button>
        </form>
        {active && (
          <form
            className="card space-y-4 rounded-3xl p-5"
            onSubmit={(e) => {
              e.preventDefault();
              complete();
            }}
          >
            <h3 className="text-xl font-semibold">
              Complete Batch #{active.id}
            </h3>
            <p>
              Review actual consumption before completing. Completing moves
              inventory once.
            </p>
            <label className="grid gap-2">
              Completed candles
              <input
                required
                className={field}
                type="number"
                min="0"
                step="1"
                value={actual}
                onChange={(e) => setActual(Number(e.target.value))}
              />
            </label>
            {consumption.map((c, index) => {
              const snapshot = JSON.parse(active.recipe_snapshot!) as Snapshot;
              const line = snapshot.plan.availability.find(
                (a) => a.id === c.material_id,
              )!;
              return (
                <label className="grid gap-2" key={c.material_id}>
                  {line.name} · actual consumption ({line.unit})
                  <input
                    required
                    className={field}
                    type="number"
                    min="0"
                    step="0.000001"
                    value={c.quantity}
                    onChange={(e) =>
                      setConsumption(
                        consumption.map((v, j) =>
                          j === index
                            ? { ...v, quantity: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
              );
            })}
            <label className="grid gap-2">
              Actual labor minutes
              <input
                required
                className={field}
                type="number"
                min="0"
                step="any"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
            <label className="grid gap-2">
              Actual hourly labor rate ($)
              <input
                required
                className={field}
                type="number"
                min="0"
                step="any"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              />
            </label>
            <button className={button} disabled={busy} type="submit">
              Complete Manufacturing Batch
            </button>
            <button
              type="button"
              className="px-4"
              onClick={() => setActive(null)}
            >
              Cancel
            </button>
          </form>
        )}
        {message && (
          <p role="status" className="rounded-xl bg-[#F4EAE8] p-4">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
