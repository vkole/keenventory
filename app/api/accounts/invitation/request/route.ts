import { sameOrigin, AccessError } from "@/lib/access";
import { requestInvitation } from "@/lib/invitations";
import { ZodError } from "zod";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await requestInvitation((await request.json()).email);
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : e instanceof ZodError
              ? "Enter a valid email address."
              : "Unable to record your request. Contact your workspace administrator.",
      },
      {
        status:
          e instanceof AccessError
            ? e.status
            : e instanceof ZodError
              ? 400
              : 503,
      },
    );
  }
  return Response.json(
    {
      message:
        "Your request has been recorded for the workspace administrator. If you are the initial Owner, regenerate your setup link using the server owner-claim command.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
