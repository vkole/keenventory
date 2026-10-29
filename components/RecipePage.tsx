"use client";
import Link from "next/link";
import { useState } from "react";
import type { DashboardData } from "@/lib/data";
import { can, type Viewer } from "@/lib/permissions";
import { RecipeBuilder, type EditableRecipe } from "./RecipeBuilder";
import { AttachmentGallery } from "./AttachmentGallery";
import { AccountMenu } from "./AccountMenu";
import { planProduction, pricing } from "@/lib/production";
import { jsonRequest, buttonClass } from "./ProductForm";
export function RecipePage({
  data,
  user,
  id,
  editor = false,
  copy = false,
  productId,
}: {
  data: DashboardData;
  user: Viewer;
  id?: number;
  editor?: boolean;
  copy?: boolean;
  productId?: number;
}) {
  const recipe = data.recipes.find((r) => r.id === id) as
      EditableRecipe | undefined,
    [message, setMessage] = useState("");
  async function action(action: string) {
    if (
      !recipe ||
      !confirm(
        action === "delete"
          ? "Delete this recipe? Production history will prevent deletion."
          : "Archive this recipe? Existing production history will remain available.",
      )
    )
      return;
    try {
      await jsonRequest(
        "/api/recipes",
        { id: recipe.id, action },
        action === "delete" ? "DELETE" : "PATCH",
      );
      window.location.assign("/?module=recipes");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed.");
    }
  }
  const costs = recipe ? planProduction(recipe, data.materials) : null;
  return (
    <main className="min-h-screen bg-[#F4EAE8] p-4 text-[#000E2D] sm:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/?module=recipes">Keenventory / Recipes</Link>
          <AccountMenu user={user} />
        </header>
        {message && <p role="alert">{message}</p>}
        {editor ? (
          <RecipeBuilder
            data={data}
            productId={productId}
            initialRecipe={recipe}
            duplicate={copy}
            user={user}
            onRefresh={() => {}}
            onSaved={(id) => {
              window.location.assign("/recipes/" + id);
            }}
            onManufacture={(recipe) =>
              window.location.assign(
                "/?module=manufacturing&recipe=" + recipe.id,
              )
            }
          />
        ) : recipe ? (
          <section className="space-y-5 rounded-3xl bg-white p-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold">{recipe.name}</h1>
                <p>
                  {data.products.find((p) => p.id === recipe.product_id)?.name}{" "}
                  · v{recipe.version} · {recipe.status}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {can(user, "recipes", "edit") && (
                  <a className={buttonClass} href={"/recipes/" + id + "/edit"}>
                    Edit Recipe
                  </a>
                )}
                {can(user, "recipes", "create") && (
                  <a className={buttonClass} href={"/recipes/new?copy=" + id}>
                    Duplicate Recipe
                  </a>
                )}
                {can(user, "recipes", "edit") && (
                  <button onClick={() => action("archive")}>Archive</button>
                )}
                {can(user, "recipes", "delete") && (
                  <button onClick={() => action("delete")}>Delete</button>
                )}
              </div>
            </header>
            <p>
              Batch yield: {recipe.batch_yield} · Time: {recipe.batch_minutes}{" "}
              minutes
            </p>
            {can(user, "materialCosts") && costs && (
              <p>
                Batch cost: ${costs.totalBatchCost.toFixed(2)} · Unit cost: $
                {costs.costPerUnit.toFixed(2)}
              </p>
            )}
            <AttachmentGallery
              type="recipe"
              id={recipe.id}
              editable={can(user, "recipes", "edit")}
            />
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Quantity per unit</th>
                  <th>Type</th>
                  <th>Batch Quantity</th>
                  {can(user, "materialCosts") && (
                    <>
                      <th>Unit Cost</th>
                      <th>Batch Cost</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {recipe.ingredients.map((i, n) => (
                  <tr className="border-t" key={n}>
                    <td className="py-3">{i.item_name}</td>
                    <td>
                      {i.quantity} {i.unit}
                    </td>
                    <td>{i.item_type}</td>
                    <td>
                      {i.quantity * recipe.batch_yield} {i.unit}
                    </td>
                    {can(user, "materialCosts") && (
                      <>
                        <td>${(costs?.lines[n]?.unit_cost ?? 0).toFixed(2)}</td>
                        <td>${(costs?.lines[n]?.total ?? 0).toFixed(2)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {can(user, "materialCosts") &&
              can(user, "productPricing") &&
              can(user, "profitability") &&
              costs && (
                <section className="space-y-3 rounded-xl bg-[#F4EAE8] p-4">
                  <h2 className="text-lg font-semibold">Pricing Guidance</h2>
                  <p>
                    Estimates use current material costs and the saved labor
                    model.
                  </p>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {Object.entries({
                      Materials: costs.materialCost + costs.componentCost,
                      Labor: costs.laborCost,
                      Overhead: recipe.overhead ?? 0,
                      "Total Batch Cost": costs.totalBatchCost,
                      "Cost Per Unit": costs.costPerUnit,
                      "Retail Price":
                        data.products.find((p) => p.id === recipe.product_id)
                          ?.retail_price ?? 0,
                      "Suggested Wholesale": costs.costPerUnit * 2,
                      "Profit Per Unit":
                        (data.products.find((p) => p.id === recipe.product_id)
                          ?.retail_price ?? 0) - costs.costPerUnit,
                    }).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs">{k}</dt>
                        <dd>${v.toFixed(2)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p>
                    Gross Margin:{" "}
                    {pricing(
                      costs.costPerUnit,
                      data.products.find((p) => p.id === recipe.product_id)
                        ?.retail_price ?? 0,
                      150,
                      50,
                      "margin",
                    ).margin.toFixed(2)}
                    % · Markup:{" "}
                    {costs.costPerUnit
                      ? (
                          (((data.products.find(
                            (p) => p.id === recipe.product_id,
                          )?.retail_price ?? 0) -
                            costs.costPerUnit) /
                            costs.costPerUnit) *
                          100
                        ).toFixed(2) + "%"
                      : "Unavailable"}
                  </p>
                </section>
              )}
            {(
              [
                "description",
                "preparation_notes",
                "safety_notes",
                "instructions",
                "notes",
              ] as const
            ).map((k) => (
              <section key={k}>
                <h2 className="font-semibold capitalize">
                  {k.replaceAll("_", " ")}
                </h2>
                <p className="whitespace-pre-wrap">
                  {String(recipe[k] ?? "") || "—"}
                </p>
              </section>
            ))}
          </section>
        ) : (
          <p>Recipe not found.</p>
        )}
      </div>
    </main>
  );
}
