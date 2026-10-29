import { authentication } from "@/lib/auth";
import { sameOrigin, viewer, audit } from "@/lib/access";
import { throttle } from "@/lib/accounts";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
const publicPaths = new Set([
  "sign-in/email",
  "get-session",
  "sign-out",
  "request-password-reset",
  "reset-password",
  "verify-email",
  "send-verification-email",
  "two-factor/verify-totp",
  "two-factor/verify-backup-code",
]);
const privatePaths = new Set([
  "change-password",
  "change-email",
  "list-sessions",
  "revoke-session",
  "revoke-other-sessions",
  "two-factor/enable",
  "two-factor/disable",
  "two-factor/get-totp-uri",
  "two-factor/generate-backup-codes",
]);
async function handle(request: Request) {
  try {
    sameOrigin(request);
    const path = new URL(request.url).pathname.replace("/api/auth/", "");
    if (!publicPaths.has(path) && !privatePaths.has(path))
      return Response.json({ error: "Not found." }, { status: 404 });
    const user =
      privatePaths.has(path) || path === "sign-out"
        ? await viewer(request.headers)
        : null;
    if (privatePaths.has(path) && !user)
      return Response.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    if (
      path === "sign-in/email" ||
      path === "request-password-reset" ||
      path === "send-verification-email"
    ) {
      const data = await request.clone().json();
      throttle(
        `auth:${path}:${String(data.email).toLowerCase()}`,
        path === "sign-in/email" ? 10 : 3,
        300,
      );
    }
    const auth = await authentication();
    if (path === "change-email") {
      throttle("change-email:" + user!.id, 5, 300);
      const body = await request.clone().json();
      const account = db
        .prepare(
          "SELECT password FROM account WHERE userId=? AND providerId='credential'",
        )
        .get(user!.id) as { password: string } | undefined;
      const ctx = await auth.$context;
      if (
        !account ||
        typeof body.currentPassword !== "string" ||
        !(await ctx.password.verify({
          hash: account.password,
          password: body.currentPassword,
        }))
      )
        return Response.json(
          { error: "Reauthentication required." },
          { status: 403 },
        );
    }
    const response = await auth.handler(request);
    if (path === "sign-in/email") {
      const result = await response.clone().json();
      audit(result.user ?? null, "Sign in", "", response.ok);
      if (!response.ok)
        return Response.json(
          {
            error:
              "Unable to sign in. Check your credentials or try again later.",
          },
          { status: response.status },
        );
    }
    if (path === "request-password-reset" || path === "send-verification-email")
      return Response.json({
        message: "If the account is eligible, an email will arrive shortly.",
      });
    if (
      [
        "change-password",
        "change-email",
        "two-factor/enable",
        "two-factor/disable",
        "sign-out",
        "revoke-session",
        "revoke-other-sessions",
      ].includes(path)
    )
      audit(user, "Account " + path, "", response.ok);
    if (path === "get-session" && response.ok) {
      const data = await response.clone().json();
      if (
        data?.user &&
        !db
          .prepare(
            "SELECT user_id FROM organization_memberships WHERE user_id=? AND status='Active' AND organization_id=1",
          )
          .get(data.user.id)
      )
        return Response.json(null);
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error && "status" in e
            ? e.message
            : "Account request could not be completed.",
      },
      { status: e instanceof Error && "status" in e ? Number(e.status) : 400 },
    );
  }
}
export const GET = handle;
export const POST = handle;
