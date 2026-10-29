import { db } from "@/lib/db";
import { secured, viewer, requirePermission } from "@/lib/access";
import { invite, updateMembership } from "@/lib/accounts";
async function get(request: Request) {
  const user = (await viewer(request.headers))!;
  if (!["Owner", "Admin"].includes(user.role))
    return Response.json(
      { error: "Only administrators can manage users." },
      { status: 403 },
    );
  const members = db
    .prepare(
      "SELECT u.id,u.name,u.email,m.role,m.permissions,m.status,m.last_login FROM organization_memberships m JOIN user u ON u.id=m.user_id WHERE m.organization_id=1",
    )
    .all();
  const invitations = db
    .prepare(
      "SELECT id,name,email,role,permissions,status,NULL last_login FROM invitations WHERE organization_id=1 AND status IN ('Pending Invitation','Delivery Failed')",
    )
    .all();
  const requests = db
    .prepare(
      "SELECT email,created_at FROM invitation_requests WHERE status='Pending' ORDER BY created_at DESC",
    )
    .all();
  return Response.json({ users: [...members, ...invitations], requests });
}
async function post(request: Request) {
  try {
    const user = (await viewer(request.headers))!;
    return Response.json(await invite(user, await request.json()));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invitation failed." },
      { status: 400 },
    );
  }
}
async function patch(request: Request) {
  try {
    return Response.json(
      await updateMembership(
        (await viewer(request.headers))!,
        await request.json(),
      ),
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "User update failed." },
      { status: 400 },
    );
  }
}
export const GET = secured("users", get);
export const POST = secured("users", post);
export const PATCH = secured("users", patch);
