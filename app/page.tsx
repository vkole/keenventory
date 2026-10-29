import { getDashboardData } from "@/lib/data";
import { InventoryWorkspace } from "@/components/InventoryWorkspace";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { viewer, dashboardFor } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await viewer(new Headers(await headers())).catch(() => null);
  if (!user) redirect("/login");
  const data = await getDashboardData();
  return (
    <InventoryWorkspace initialData={dashboardFor(data, user)} user={user} />
  );
}
