import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { viewer } from "@/lib/access";
import { ProfileWorkspace } from "@/components/ProfileWorkspace";
export default async function Page() {
  const user = await viewer(new Headers(await headers()));
  if (!user) redirect("/login?next=/settings/profile");
  return <ProfileWorkspace user={user} />;
}
