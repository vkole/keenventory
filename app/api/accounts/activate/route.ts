import { z } from "zod";
import { completeInvitation, throttle } from "@/lib/accounts";
import { sameOrigin, AccessError } from "@/lib/access";
import { authentication } from "@/lib/auth";
import {
  cookieValue,
  setupInvitation,
  setupCookieHeader,
  validateInvitation,
} from "@/lib/invitations";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const p = z
      .object({
        token: z.string().min(40).max(200).optional(),
        name: z.string().trim().min(1).max(150),
        password: z.string().min(12).max(128).optional(),
        confirmPassword: z.string().optional(),
      })
      .parse(await request.json());
    throttle("activate:global", 30, 300);
    throttle(
      "activate:" + (cookieValue(request) ?? p.token ?? "missing"),
      5,
      300,
    );
    const info = p.token
      ? await validateInvitation(p.token)
      : await setupInvitation(request);
    if (
      !info.existing_user_id &&
      (!p.password || p.confirmPassword !== p.password)
    )
      return Response.json(
        {
          error:
            "Use a password of at least 12 characters and matching confirmation.",
        },
        { status: 400 },
      );
    const auth = await authentication();
    const session = await auth.api.getSession({ headers: request.headers });
    const identity = session
      ? {
          id: session.user.id,
          email: session.user.email,
          emailVerified: session.user.emailVerified,
          authenticatedAt: new Date(session.session.createdAt).getTime(),
        }
      : undefined;
    const account = await completeInvitation(info.token_hash, p, identity);
    let authenticated = account.existing;
    let sessionHeaders = new Headers();
    if (!account.existing) {
      // Account creation is committed; a session failure must not suggest reuse
      // of a consumed invitation. Offer sign-in without losing the new account.
      try {
        const login = await auth.api.signInEmail({
          headers: request.headers,
          body: {
            email: account.email,
            password: p.password!,
            rememberMe: false,
          },
          asResponse: true,
        });
        authenticated = login.ok;
        if (login.ok) sessionHeaders = login.headers;
      } catch {
        authenticated = false;
      }
    }
    const response = Response.json({
      success: true,
      authenticated,
      message: "Your Keenventory account has been successfully created.",
      redirectTo: authenticated ? "/dashboard" : "/login",
    });
    for (const cookie of sessionHeaders.getSetCookie())
      response.headers.append("Set-Cookie", cookie);
    response.headers.append("Set-Cookie", setupCookieHeader("", 0));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (e) {
    const needsSignIn = e instanceof AccessError && e.status === 409;
    const passwordError =
      e instanceof Error && /password|Passwords/.test(e.message);
    return Response.json(
      {
        error: needsSignIn
          ? e.message
          : passwordError
            ? e.message
            : "This invitation is invalid, expired, revoked, or already used. Validate the link again or request a new invitation.",
        ...(needsSignIn ? { code: "SIGN_IN_REQUIRED" } : {}),
      },
      {
        status: e instanceof AccessError ? e.status : 400,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
