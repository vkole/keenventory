import { randomBytes } from "node:crypto";
let cookie = "";
export class TestRequest extends globalThis.Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookie);
    headers.set("origin", "http://localhost");
    if (typeof init?.body === "string" && !headers.has("content-type"))
      headers.set("content-type", "application/json");
    super(input, { ...init, headers });
  }
}
export async function setupTestOwner() {
  process.env.BETTER_AUTH_URL = "http://localhost";
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("hex");
  const { db } = await import("./db");
  const { activate, tokenHash } = await import("./accounts");
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO owner_claims(id,email,name,token_hash,expires_at) VALUES(1,?,?,?,?)",
  ).run(
    "owner@example.test",
    "Test Owner",
    tokenHash(token),
    Date.now() + 60000,
  );
  const password = randomBytes(24).toString("hex");
  await activate({ token, password }, true);
  const { authentication } = await import("./auth");
  const auth = await authentication();
  const response = await auth.api.signInEmail({
    body: { email: "owner@example.test", password },
    asResponse: true,
  });
  if (!response.ok)
    throw Error("Test owner login failed: " + (await response.text()));
  cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { cookie, password, email: "owner@example.test" };
}
