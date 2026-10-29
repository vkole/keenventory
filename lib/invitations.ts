import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { authentication } from "./auth";
import { tokenHash, throttle } from "./accounts";
import { appURL, sendMail } from "./email";
import type { Role } from "./permissions";

export type VerifiedInvitation = {
  id: string;
  source: "owner" | "invitation";
  token_hash: string;
  email: string;
  name: string;
  role: Role;
  permissions: string;
  expires_at: number;
  workspace: string;
  existing_user_id: string | null;
  email_verified: boolean;
};
export function invitationByHash(hash: string): VerifiedInvitation {
  const now = Date.now();
  const workspace = (
    db.prepare("SELECT name FROM organizations WHERE id=1").get() as {
      name: string;
    }
  ).name;
  const claim = db
    .prepare(
      "SELECT * FROM owner_claims WHERE id=1 AND token_hash=? AND used_at IS NULL AND expires_at>?",
    )
    .get(hash, now) as
    { email: string; name: string; expires_at: number } | undefined;
  let info: Omit<VerifiedInvitation, "existing_user_id" | "email_verified">;
  if (
    claim &&
    !db.prepare("SELECT user_id FROM organization_memberships").get()
  ) {
    info = {
      ...claim,
      id: "owner",
      source: "owner",
      token_hash: hash,
      role: "Owner",
      permissions: "{}",
      workspace,
    };
  } else {
    const inv = db
      .prepare(
        "SELECT * FROM invitations WHERE token_hash=? AND organization_id=1 AND status='Pending Invitation' AND expires_at>?",
      )
      .get(hash, now) as
      | {
          id: string;
          email: string;
          name: string;
          role: Role;
          permissions: string;
          expires_at: number;
        }
      | undefined;
    if (!inv)
      throw Error(
        "This invitation is invalid, expired, revoked, or already used.",
      );
    info = { ...inv, source: "invitation", token_hash: hash, workspace };
  }
  const existing = db
    .prepare("SELECT id,emailVerified FROM user WHERE lower(email)=lower(?)")
    .get(info.email) as { id: string; emailVerified: number } | undefined;
  return {
    ...info,
    existing_user_id: existing?.id ?? null,
    email_verified: !!existing?.emailVerified,
  };
}
export async function validateInvitation(token: string) {
  z.string().min(40).max(200).parse(token);
  await authentication();
  return invitationByHash(tokenHash(token));
}
export const setupCookie = "keenventory.invitation";
export function cookieValue(request: Request, name = setupCookie) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(name + "="))
    ?.slice(name.length + 1);
  return value && /^[A-Za-z0-9_-]{40,100}$/.test(value) ? value : null;
}
export function setupCookieHeader(value: string, maxAge = 900) {
  return `${setupCookie}=${value}; Path=/api/accounts; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${appURL().startsWith("https://") ? "; Secure" : ""}`;
}
export function establishSetup(info: VerifiedInvitation) {
  const key = randomBytes(32).toString("base64url");
  db.prepare("DELETE FROM invitation_sessions WHERE expires_at<?").run(
    Date.now(),
  );
  db.prepare(
    "INSERT INTO invitation_sessions(session_hash,token_hash,expires_at) VALUES(?,?,?)",
  ).run(
    tokenHash(key),
    info.token_hash,
    Math.min(info.expires_at, Date.now() + 15 * 60 * 1000),
  );
  return key;
}
export async function setupInvitation(request: Request) {
  await authentication();
  const key = cookieValue(request);
  const session = key
    ? (db
        .prepare(
          "SELECT token_hash FROM invitation_sessions WHERE session_hash=? AND expires_at>?",
        )
        .get(tokenHash(key), Date.now()) as { token_hash: string } | undefined)
    : undefined;
  if (!session)
    throw Error(
      "Open the complete invitation link from your email to continue.",
    );
  return invitationByHash(session.token_hash);
}
export async function invitationView(
  info: VerifiedInvitation,
  request: Request,
) {
  const auth = await authentication();
  const session = await auth.api.getSession({ headers: request.headers });
  const authenticated =
    !!session &&
    !!session.user.emailVerified &&
    session.user.id === info.existing_user_id &&
    session.user.email.toLowerCase() === info.email.toLowerCase() &&
    Date.now() - new Date(session.session.createdAt).getTime() < 10 * 60 * 1000;
  return {
    name: info.name,
    email: info.email,
    workspace: info.workspace,
    role: info.role,
    existingUser: !!info.existing_user_id,
    authenticated,
    emailVerified: info.email_verified,
  };
}
export async function requestInvitation(email: string) {
  const address = z
    .email()
    .transform((s) => s.trim().toLowerCase())
    .parse(email);
  throttle("invitation-request:" + address, 3, 3600);
  throttle("invitation-request:global", 30, 300);
  await authentication();
  // This records a request for an administrator. It never reactivates revoked
  // invitations or grants owner access through a public endpoint.
  db.prepare(
    "INSERT INTO invitation_requests(email,status) VALUES(?,'Pending') ON CONFLICT(email) DO UPDATE SET status='Pending',created_at=CURRENT_TIMESTAMP",
  ).run(address);
  const admins = db
    .prepare(
      "SELECT u.email FROM user u JOIN organization_memberships m ON m.user_id=u.id WHERE m.organization_id=1 AND m.status='Active' AND m.role IN ('Owner','Admin')",
    )
    .all() as { email: string }[];
  for (const admin of admins)
    await sendMail(
      admin.email,
      "Keenventory invitation requested",
      `An invitation or replacement link was requested for ${address}.\n\nReview this request in User Management before inviting or resending access:\n\n${appURL()}/settings/users`,
    ).catch(() => {});
}
