import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { viewer } from "@/lib/access";
import { can } from "@/lib/permissions";
import { UsersWorkspace } from "@/components/UsersWorkspace";
export default async function Page() {
  const user = await viewer(new Headers(await headers()));
  if (!user) redirect("/login?next=/settings/users/new");
  if (!["Owner", "Admin"].includes(user.role) || !can(user, "users", "create"))
    return <p>You do not have permission to invite users.</p>;
  return <UsersWorkspace actor={user} create />;
}
