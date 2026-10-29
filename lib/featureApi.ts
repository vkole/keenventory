import {
  viewer,
  sameOrigin,
  requirePermission,
  audit,
  AccessError,
} from "./access";
import type { Viewer, Action } from "./permissions";
export function featureApi(
  feature: string,
  action: Action,
  fn: (request: Request, user: Viewer) => Promise<Response>,
) {
  return async (request: Request) => {
    let user: Viewer | null = null;
    try {
      sameOrigin(request);
      user = await viewer(request.headers);
      if (!user) throw new AccessError("Authentication required.", 401);
      requirePermission(user, feature, action);
      const response = await fn(request, user);
      response.headers.set("Cache-Control", "private, no-store");
      if (
        request.method !== "GET" ||
        new URL(request.url).searchParams.has("format") ||
        new URL(request.url).searchParams.has("download")
      )
        audit(
          user,
          request.method + " " + new URL(request.url).pathname,
          "",
          response.ok,
        );
      return response;
    } catch (error) {
      const status = error instanceof AccessError ? error.status : 400;
      if (user)
        audit(
          user,
          request.method + " " + new URL(request.url).pathname,
          "",
          false,
          { status },
        );
      return Response.json(
        { error: error instanceof Error ? error.message : "Request failed." },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  };
}
