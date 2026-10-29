import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { viewer, dashboardFor } from "./access";
import { can, type Action } from "./permissions";
import { getDashboardData } from "./data";
export async function recipePageData(action: Action = "view", id?: number) {
  const user = await viewer(new Headers(await headers()));
  if (!user) redirect("/login");
  if (!can(user, "recipes", action)) notFound();
  const data = dashboardFor(await getDashboardData(), user);
  if (id && (!Number.isInteger(id) || !data.recipes.some((r) => r.id === id)))
    notFound();
  return { user, data };
}
