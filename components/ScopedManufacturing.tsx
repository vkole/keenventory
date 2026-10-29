"use client";
import { useState } from "react";
import type { DashboardData } from "@/lib/data";
import { can, type Viewer } from "@/lib/permissions";
import { jsonRequest, inputClass, buttonClass } from "./ProductForm";
export function ScopedManufacturing({
  data,
  user,
  onSaved,
}: {
  data: DashboardData;
  user: Viewer;
  onSaved: () => Promise<void>;
}) {
  const [recipeId, setRecipeId] = useState(""),
    [planned, setPlanned] = useState(1),
    [batch, setBatch] = useState<Record<string, unknown> | null>(null),
    [actual, setActual] = useState(0),
    [minutes, setMinutes] = useState(0),
    [consumption, setConsumption] = useState<
      { material_id: number; quantity: number; name: string }[]
    >([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await onSaved();
      setMessage("Manufacturing saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Manufacturing failed.");
    } finally {
      setBusy(false);
    }
  }
  async function choose(id: string) {
    const result = await jsonRequest("/api/manufacturing");
    const b = result.batches.find(
      (b: Record<string, unknown>) => String(b.id) === id,
    );
    if (!b) {
      setBatch(null);
      return;
    }
    const snapshot = JSON.parse(b.recipe_snapshot ?? "{}");
    setBatch(b);
    setActual(b.planned_quantity);
    setMinutes(0);
    setConsumption(
      (snapshot.plan?.availability ?? []).map(
        (l: { id: number; required: number; name: string }) => ({
          material_id: l.id,
          quantity: l.required,
          name: l.name ?? "Material #" + l.id,
        }),
      ),
    );
  }
  return (
    <section className="grid gap-5 border-t pt-5">
      {message && <p role="alert">{message}</p>}
      {can(user, "manufacturing", "create") && (
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            perform(async () => {
              const recipe = data.recipes.find(
                (r) => r.id === Number(recipeId),
              );
              if (!recipe) throw Error("Choose a recipe.");
              await jsonRequest("/api/manufacturing", {
                recipe_id: recipe.id,
                product_id: recipe.product_id,
                planned_quantity: planned,
                request_key: crypto.randomUUID(),
              });
            });
          }}
        >
          <label className="grid gap-2">
            Recipe
            <select
              required
              className={inputClass}
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
            >
              <option value="">Choose active recipe</option>
              {data.recipes
                .filter((r) => r.is_active && r.status === "Active")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · v{r.version}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-2">
            Planned quantity
            <input
              required
              className={inputClass}
              type="number"
              min={1}
              step={1}
              value={planned}
              onChange={(e) => setPlanned(Number(e.target.value))}
            />
          </label>
          <button disabled={busy} className={buttonClass}>
            Create Batch
          </button>
        </form>
      )}
      {can(user, "manufacturing", "approve") && (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              !batch ||
              !window.confirm(
                "Complete this batch and record inventory consumption?",
              )
            )
              return;
            perform(async () => {
              await jsonRequest(
                "/api/manufacturing",
                {
                  id: batch.id,
                  actual_quantity: actual,
                  actual_minutes: minutes,
                  consumption: consumption.map(({ material_id, quantity }) => ({
                    material_id,
                    quantity,
                  })),
                },
                "PATCH",
              );
              setBatch(null);
            });
          }}
        >
          <h3 className="text-xl">Record Production</h3>
          <select
            required
            aria-label="Manufacturing batch"
            className={inputClass}
            value={batch ? String(batch.id) : ""}
            onChange={(e) =>
              choose(e.target.value).catch((e) => setMessage(e.message))
            }
          >
            <option value="">Choose open batch</option>
            {data.manufacturingBatches
              .filter((b) =>
                ["Draft", "Scheduled", "In Progress"].includes(b.status),
              )
              .map((b) => (
                <option value={b.id} key={b.id}>
                  Batch #{b.id} · {b.planned_quantity} planned
                </option>
              ))}
          </select>
          {batch && (
            <>
              <label className="grid gap-2">
                Completed quantity
                <input
                  required
                  className={inputClass}
                  type="number"
                  min={0}
                  step={1}
                  value={actual}
                  onChange={(e) => setActual(Number(e.target.value))}
                />
              </label>
              <label className="grid gap-2">
                Actual minutes
                <input
                  required
                  className={inputClass}
                  type="number"
                  min={0}
                  step="any"
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </label>
              {consumption.map((c, i) => (
                <label key={c.material_id} className="grid gap-2">
                  {c.name} · Actual consumption
                  <input
                    required
                    className={inputClass}
                    type="number"
                    min={0}
                    step="any"
                    value={c.quantity}
                    onChange={(e) =>
                      setConsumption(
                        consumption.map((line, j) =>
                          j === i
                            ? { ...line, quantity: Number(e.target.value) }
                            : line,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              <button disabled={busy} className={buttonClass}>
                Complete Manufacturing
              </button>
            </>
          )}
        </form>
      )}
    </section>
  );
}
