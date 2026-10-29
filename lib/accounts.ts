import { invitationByHash } from "./invitations";
import { checkNewPassword } from "./passwordPolicy";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { authentication } from "./auth";
import { appURL, sendMail } from "./email";
import { audit, AccessError, requirePermission } from "./access";
import {
  defaults,
  roles,
  validatePermissions,
  type Viewer,
} from "./permissions";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function throttle(key: string, max = 5, seconds = 300) {
  db.transaction(() => {
    const now = Date.now();
    db.prepare("DELETE FROM auth_throttle WHERE expires_at<?").run(now);
    db.prepare(
      "INSERT INTO auth_throttle(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
    ).run(tokenHash(key), now + seconds * 1000);
  }).immediate();
  const row = db
    .prepare("SELECT count FROM auth_throttle WHERE key=?")
    .get(tokenHash(key)) as { count: number };
  if (row.count > max)
    throw new AccessError("Too many attempts. Try again later.", 429);
}
type Invitation = {
  id: string;
  email: string;
  name: string;
  role: Viewer["role"];
  permissions: string;
  token_hash: string;
  expires_at: number;
  status: string;
  created_by: string;
};
export async function invite(actor: Viewer, input: unknown, resendId?: string) {
  requirePermission(actor, "users", "create");
  if (!["Owner", "Admin"].includes(actor.role))
    throw new AccessError("Only administrators can invite users.");
  const p = z
    .object({
      name: z.string().trim().min(1).max(150),
      email: z.email().transform((e) => e.toLowerCase()),
      role: z.enum(roles),
      permissions: z.unknown(),
    })
    .parse(input);
  if (actor.role !== "Owner" && ["Owner", "Admin"].includes(p.role))
    throw new AccessError("Only owners can assign administrative roles.");
  const permissions = validatePermissions(
    p.permissions ?? defaults(p.role),
    p.role,
  );
  for (const [f, list] of Object.entries(permissions))
    for (const a of list) requirePermission(actor, f, a);
  await authentication();
  if (
    db
      .prepare(
        "SELECT m.user_id FROM organization_memberships m JOIN user u ON u.id=m.user_id WHERE lower(u.email)=?",
      )
      .get(p.email)
  )
    throw Error("This user already belongs to the workspace.");
  const existing = db
    .prepare(
      "SELECT id FROM invitations WHERE lower(email)=? AND status='Pending Invitation'",
    )
    .get(p.email) as { id: string } | undefined;
  if (existing && existing.id !== resendId)
    throw Error("An invitation is already pending for this email.");
  const token = randomBytes(32).toString("base64url"),
    id = resendId ?? randomUUID();
  const expires = Date.now() + 48 * 60 * 60 * 1000;
  // New token is not made usable until delivery succeeds. Failure leaves no
  // activatable invitation; resends invalidate the previous link.
  db.prepare(
    "INSERT INTO invitations(id,email,name,role,permissions,token_hash,expires_at,status,created_by) VALUES(?,?,?,?,?,?,?,'Sending',?) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at,status='Sending'",
  ).run(
    id,
    p.email,
    p.name,
    p.role,
    JSON.stringify(permissions),
    tokenHash(token),
    expires,
    actor.id,
  );
  try {
    await sendMail(
      p.email,
      "You're Invited to Keenventory",
      `You've been invited to join the Keenventory workspace for Keen Scents.\n\nKeenventory helps our team manage inventory, materials, recipes, manufacturing, orders, and business operations in one place.\n\nClick the link below to activate your account and get started.\n\nAccept Invitation: ${appURL()}/accept-invitation?token=${token}\n\nThis invitation expires in 48 hours.`,
    );
    db.prepare(
      "UPDATE invitations SET status='Pending Invitation' WHERE id=? AND status='Sending'",
    ).run(id);
    db.prepare(
      "UPDATE invitation_requests SET status='Completed' WHERE lower(email)=lower(?)",
    ).run(p.email);
    audit(actor, resendId ? "Invitation resent" : "User invited", id, true, {
      email: p.email,
      role: p.role,
    });
  } catch (e) {
    db.prepare(
      "UPDATE invitations SET status='Delivery Failed' WHERE id=?",
    ).run(id);
    audit(actor, "Invitation delivery", id, false);
    throw e;
  }
  return { id };
}
export type ActivationIdentity = {
  id: string;
  email: string;
  emailVerified: boolean;
  authenticatedAt: number;
};
export async function activate(
  input: unknown,
  _ownerHint = false,
  identity?: ActivationIdentity,
) {
  const token = z
    .string()
    .min(40)
    .max(200)
    .parse((input as { token?: unknown })?.token);
  await authentication();
  return completeInvitation(tokenHash(token), input, identity);
}
export async function completeInvitation(
  hash: string,
  input: unknown,
  identity?: ActivationIdentity,
) {
  const p = z
    .object({
      name: z.string().trim().min(1).max(150).optional(),
      password: z.string().min(12).max(128).optional(),
      confirmPassword: z.string().optional(),
    })
    .parse(input);
  const auth = await authentication();
  const initial = invitationByHash(hash);
  let password: string | undefined;
  if (initial.existing_user_id) {
    if (
      !identity ||
      !identity.emailVerified ||
      identity.id !== initial.existing_user_id ||
      identity.email.toLowerCase() !== initial.email.toLowerCase() ||
      Date.now() - identity.authenticatedAt > 10 * 60 * 1000
    )
      throw new AccessError(
        "Sign in to the invited account before accepting this invitation.",
        409,
      );
  } else {
    if (!p.password)
      throw Error("Create a password of at least 12 characters.");
    if (p.confirmPassword !== undefined && p.confirmPassword !== p.password)
      throw Error("Passwords must match.");
    await checkNewPassword(p.password);
    const ctx = await auth.$context;
    password = await ctx.password.hash(p.password);
  }
  return db
    .transaction(() => {
      // Re-read all authority inside the transaction: revoked/changed invitations
      // and identities created by a concurrent request cannot be accepted stale.
      const info = invitationByHash(hash);
      if (info.existing_user_id !== initial.existing_user_id)
        throw Error("Account state changed. Validate this invitation again.");
      const now = Date.now();
      let id = info.existing_user_id;
      if (id) {
        const current = db
          .prepare("SELECT id,email,emailVerified FROM user WHERE id=?")
          .get(id) as
          { id: string; email: string; emailVerified: number } | undefined;
        if (
          !current ||
          !current.emailVerified ||
          current.email.toLowerCase() !== info.email.toLowerCase() ||
          identity?.id !== current.id
        )
          throw Error("Sign in to the invited account to continue.");
        const membership = db
          .prepare(
            "SELECT status FROM organization_memberships WHERE user_id=?",
          )
          .get(id) as { status: string } | undefined;
        if (membership && membership.status !== "Active")
          throw Error(
            "Contact your workspace administrator to restore access.",
          );
        // Existing memberships retain their permissions; accepting a stale invite
        // must never silently replace current access or promote an existing user.
        if (!membership)
          db.prepare(
            "INSERT INTO organization_memberships(user_id,role,permissions,status) VALUES(?,?,?,'Active')",
          ).run(
            id,
            info.role,
            info.source === "owner"
              ? JSON.stringify(defaults("Owner"))
              : info.permissions,
          );
        if (p.name)
          db.prepare("UPDATE user SET name=?,updatedAt=? WHERE id=?").run(
            p.name,
            now,
            id,
          );
      } else {
        id = randomUUID();
        db.prepare(
          "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)",
        ).run(id, p.name ?? info.name, info.email, now, now);
        db.prepare(
          "INSERT INTO account(id,userId,accountId,providerId,password,createdAt,updatedAt) VALUES(?,?,?,'credential',?,?,?)",
        ).run(randomUUID(), id, id, password, now, now);
        db.prepare(
          "INSERT INTO organization_memberships(user_id,role,permissions,status) VALUES(?,?,?,'Active')",
        ).run(
          id,
          info.role,
          info.source === "owner"
            ? JSON.stringify(defaults("Owner"))
            : info.permissions,
        );
      }
      if (info.source === "owner") {
        const changed = db
          .prepare(
            "UPDATE owner_claims SET used_at=? WHERE id=1 AND token_hash=? AND used_at IS NULL AND expires_at>?",
          )
          .run(now, hash, now);
        if (!changed.changes)
          throw Error("This setup link is invalid or expired.");
      } else {
        const changed = db
          .prepare(
            "UPDATE invitations SET status='Accepted' WHERE id=? AND token_hash=? AND status='Pending Invitation' AND expires_at>?",
          )
          .run(info.id, hash, now);
        if (!changed.changes)
          throw Error("This invitation is invalid or expired.");
      }
      db.prepare("INSERT OR IGNORE INTO user_profiles(user_id) VALUES(?)").run(
        id,
      );
      db.prepare("DELETE FROM invitation_sessions WHERE token_hash=?").run(
        hash,
      );
      db.prepare(
        "UPDATE invitation_requests SET status='Completed' WHERE lower(email)=lower(?)",
      ).run(info.email);
      audit(
        { id },
        info.source === "owner" ? "Owner activated" : "Invitation accepted",
        id,
        true,
        { role: info.role, existing_identity: !!info.existing_user_id },
      );
      return {
        email: info.email,
        userId: id,
        existing: !!info.existing_user_id,
      };
    })
    .immediate();
}
export async function updateMembership(actor: Viewer, input: unknown) {
  requirePermission(actor, "users", "edit");
  if (!["Owner", "Admin"].includes(actor.role))
    throw new AccessError("Only administrators can manage users.");
  const p = z
    .object({
      id: z.string(),
      action: z.enum(["edit", "disable", "reactivate", "revoke", "resend"]),
      name: z.string().trim().min(1).max(150).optional(),
      role: z.enum(roles).optional(),
      permissions: z.unknown().optional(),
    })
    .parse(input);
  if (p.action === "resend") {
    const inv = db
      .prepare(
        "SELECT * FROM invitations WHERE id=? AND status IN ('Pending Invitation','Delivery Failed')",
      )
      .get(p.id) as Invitation | undefined;
    if (!inv) throw Error("Pending invitation not found.");
    return invite(
      actor,
      { ...inv, permissions: JSON.parse(inv.permissions) },
      p.id,
    );
  }
  if (p.action === "revoke") {
    const inv = db
      .prepare(
        "SELECT id FROM invitations WHERE id=? AND status IN ('Pending Invitation','Delivery Failed')",
      )
      .get(p.id);
    if (inv) {
      db.prepare("UPDATE invitations SET status='Revoked' WHERE id=?").run(
        p.id,
      );
      audit(actor, "Invitation revoked", p.id, true);
      return { ok: true };
    }
  }
  return db
    .transaction(() => {
      const previous = db
        .prepare(
          "SELECT * FROM organization_memberships WHERE user_id=? AND organization_id=1",
        )
        .get(p.id) as
        | { role: Viewer["role"]; status: string; permissions: string }
        | undefined;
      if (!previous) throw Error("User not found.");
      const role = p.role ?? previous.role;
      if (
        actor.role !== "Owner" &&
        (["Owner", "Admin"].includes(previous.role) ||
          ["Owner", "Admin"].includes(role))
      )
        throw new AccessError("Only owners can manage administrative roles.");
      const status =
        p.action === "disable" || p.action === "revoke"
          ? "Disabled"
          : p.action === "reactivate"
            ? "Active"
            : previous.status;
      if (
        previous.role === "Owner" &&
        previous.status === "Active" &&
        (role !== "Owner" || status !== "Active")
      ) {
        const count = db
          .prepare(
            "SELECT COUNT(*) n FROM organization_memberships WHERE role='Owner' AND status='Active' AND organization_id=1",
          )
          .get() as { n: number };
        if (count.n <= 1)
          throw Error("The workspace must retain at least one active owner.");
      }
      const permissions =
        p.action === "edit"
          ? validatePermissions(
              p.permissions ??
                (p.role ? defaults(role) : JSON.parse(previous.permissions)),
              role,
            )
          : JSON.parse(previous.permissions);
      if (p.action === "edit")
        for (const [f, list] of Object.entries(permissions) as [
          string,
          import("./permissions").Action[],
        ][])
          for (const a of list) requirePermission(actor, f, a);
      db.prepare(
        "UPDATE organization_memberships SET role=?,status=?,permissions=? WHERE user_id=?",
      ).run(role, status, JSON.stringify(permissions), p.id);
      db.prepare("DELETE FROM user_permission_overrides WHERE user_id=?").run(
        p.id,
      );
      for (const [f, list] of Object.entries(permissions))
        db.prepare("INSERT INTO user_permission_overrides VALUES(?,?,?)").run(
          p.id,
          f,
          JSON.stringify(list),
        );
      if (p.name)
        db.prepare("UPDATE user SET name=?,updatedAt=? WHERE id=?").run(
          p.name,
          Date.now(),
          p.id,
        );
      // All account and permission changes invalidate active provider sessions.
      db.prepare("DELETE FROM session WHERE userId=?").run(p.id);
      audit(actor, "User " + p.action, p.id, true, {
        before: previous,
        after: { role, status, permissions },
      });
      return { ok: true };
    })
    .immediate();
}
