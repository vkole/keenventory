import { z } from "zod";
import { NextResponse } from "next/server";
import { sameOrigin, AccessError } from "@/lib/access";
import { throttle } from "@/lib/accounts";
import {
  validateInvitation,
  establishSetup,
  setupCookieHeader,
  setupInvitation,
  invitationView,
} from "@/lib/invitations";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
export async function GET(request: Request) {
  try {
    return NextResponse.json(
      await invitationView(await setupInvitation(request), request),
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "This setup session is missing or expired. Open your invitation email again, or request a new invitation.",
      },
      { status: 400, headers },
    );
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { token } = z
      .object({ token: z.string().min(40).max(200) })
      .parse(await request.json());
    throttle("validate-invitation:global", 100, 60);
    throttle("validate-invitation:" + token, 15, 300);
    const info = await validateInvitation(token);
    const key = establishSetup(info);
    const response = NextResponse.json(await invitationView(info, request), {
      headers,
    });
    response.headers.append("Set-Cookie", setupCookieHeader(key));
    return response;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          "This invitation is invalid, expired, revoked, or already used. Request a new invitation to continue.",
      },
      { status: e instanceof AccessError ? e.status : 400, headers },
    );
  }
}
