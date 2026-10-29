import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { viewer } from "@/lib/access";
import { AccountSettingsWorkspace } from "@/components/AccountSettingsWorkspace";

export const metadata = { title: "Account Settings | Keenventory" };
export default async function Page() {
  const user = await viewer(new Headers(await headers()));
  if (!user) redirect("/login?next=/settings/account");
  return <AccountSettingsWorkspace user={user} />;
}
