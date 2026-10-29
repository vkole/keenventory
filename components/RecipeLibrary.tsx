"use client";
import Link from "next/link";
import { useState } from "react";
import type { DashboardData } from "@/lib/data";
import { can, type Viewer } from "@/lib/permissions";
import { planProduction } from "@/lib/production";
import { inputClass, buttonClass } from "./ProductForm";
export function RecipeLibrary({
  data,
  user,
}: {
  data: DashboardData;
  user: Viewer;
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("name"),
    [page, setPage] = useState(1);
  const rows = data.recipes
    .filter(
      (r) =>
        (!status || r.status === status) &&
        `${r.name} ${data.products.find((p) => p.id === r.product_id)?.name ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "cost"
        ? planProduction(a, data.materials).costPerUnit -
          planProduction(b, data.materials).costPerUnit
        : sort === "newest"
          ? b.id - a.id
          : a.name.localeCompare(b.name),
    );
  const pages = Math.max(1, Math.ceil(rows.length / 25)),
    current = Math.min(page, pages);
  return (
    <section className="space-y-4 rounded-3xl bg-white p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        {can(user, "recipes", "create") && (
          <Link className={buttonClass} href="/recipes/new">
            Create Recipe
          </Link>
        )}
      </header>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search recipes"
          placeholder="Search recipes or products"
          className={inputClass}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Recipe status"
          className={inputClass}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {["Draft", "Active", "Archived"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Sort recipes"
          className={inputClass}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">Name</option>
          <option value="newest">Newest</option>
          {can(user, "materialCosts") && (
            <option value="cost">Unit cost</option>
          )}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Recipe",
                "Product",
                "Version",
                "Yield",
                "Status",
                "Updated",
                "Actions",
                ...(can(user, "materialCosts")
                  ? ["Material Cost", "Labor Cost", "Batch Cost", "Unit Cost"]
                  : []),
              ].map((h) => (
                <th className="p-3" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice((current - 1) * 25, current * 25).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    {r.image_id && (
                      <img
                        alt=""
                        src={"/api/attachments?id=" + r.image_id}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    )}
                    <a className="underline" href={"/recipes/" + r.id}>
                      {r.name}
                    </a>
                  </div>
                </td>
                <td>
                  {data.products.find((p) => p.id === r.product_id)?.name}
                </td>
                <td>{r.version}</td>
                <td>{r.batch_yield}</td>
                <td>{r.status}</td>
                <td>{(r.updated_at ?? r.created_at).slice(0, 10)}</td>
                <td>
                  <a className="underline" href={"/recipes/" + r.id}>
                    View
                  </a>
                  {can(user, "recipes", "edit") && (
                    <a
                      className="ml-3 underline"
                      href={"/recipes/" + r.id + "/edit"}
                    >
                      Edit
                    </a>
                  )}
                  {can(user, "recipes", "create") && (
                    <a
                      className="ml-3 underline"
                      href={"/recipes/new?copy=" + r.id}
                    >
                      Duplicate
                    </a>
                  )}
                </td>
                {can(user, "materialCosts") && (
                  <>
                    {[
                      planProduction(r, data.materials).materialCost +
                        planProduction(r, data.materials).componentCost,
                      planProduction(r, data.materials).laborCost,
                      planProduction(r, data.materials).totalBatchCost,
                      planProduction(r, data.materials).costPerUnit,
                    ].map((n, i) => (
                      <td key={i}>${n.toFixed(2)}</td>
                    ))}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-5">No recipes match.</p>}
      </div>
      <footer className="flex items-center gap-3">
        <button disabled={current <= 1} onClick={() => setPage(current - 1)}>
          Previous
        </button>
        <span>
          Page {current} of {pages} · {rows.length} recipes
        </span>
        <button
          disabled={current >= pages}
          onClick={() => setPage(current + 1)}
        >
          Next
        </button>
      </footer>
    </section>
  );
}
