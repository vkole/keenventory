import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaults } from "./permissions";

test("validated invitation setup, owner authority, single use, existing identities and authenticated redirects", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "keenventory-invitation-"));
  Object.assign(process.env, {
    KEENVENTORY_DATA_DIR: folder,
    BETTER_AUTH_URL: "http://localhost",
    BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
  });
  const { db } = await import("./db");
  try {
    const { authentication } = await import("./auth"),
      auth = await authentication();
    const { tokenHash } = await import("./accounts");
    const { validateInvitation } = await import("./invitations");
    const setup = await import("../app/api/accounts/invitation/route");
    const activation = await import("../app/api/accounts/activate/route");
    const authRoute = await import("../app/api/auth/[...all]/route");
    const { viewer } = await import("./access");
    const request = (url: string, body?: unknown, cookie = "") =>
      new Request("http://localhost" + url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          origin: "http://localhost",
          cookie,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const cookies = (r: Response) =>
      r.headers
        .getSetCookie()
        .filter((c) => !c.includes("Max-Age=0"))
        .map((c) => c.split(";")[0])
        .join("; ");
    const member = (id: string) =>
      db
        .prepare("SELECT * FROM organization_memberships WHERE user_id=?")
        .get(id) as { role: string; permissions: string; status: string };
    const identity = (email: string) =>
      db.prepare("SELECT * FROM user WHERE email=?").get(email) as {
        id: string;
        name: string;
      };
    const counts = () =>
      Object.fromEntries(
        [
          "products",
          "materials",
          "recipes",
          "manufacturing_batches",
          "shopify_mappings",
        ].map((table) => [
          table,
          (db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number })
            .n,
        ]),
      );
    const original = counts();
    const ownerToken = randomBytes(32).toString("base64url");
    db.prepare(
      "INSERT INTO owner_claims(id,email,name,token_hash,expires_at) VALUES(1,?,?,?,?)",
    ).run(
      "owner@example.test",
      "Invited Owner",
      tokenHash(ownerToken),
      Date.now() + 60000,
    );
    const valid = await setup.POST(
      request("/api/accounts/invitation", { token: ownerToken, owner: false }),
    );
    assert.equal(valid.status, 200);
    const details = await valid.json();
    assert.equal(details.email, "owner@example.test");
    assert.equal(details.role, "Owner");
    assert.equal(details.workspace, "Keen Scents");
    assert.equal(details.token, undefined);
    assert.equal(valid.headers.get("referrer-policy"), "no-referrer");
    assert.match(valid.headers.get("set-cookie")!, /HttpOnly/);
    assert.match(valid.headers.get("set-cookie")!, /SameSite=Strict/);
    const grant = cookies(valid);
    const records = JSON.stringify(
      db.prepare("SELECT * FROM invitation_sessions").all(),
    );
    assert.ok(!records.includes(ownerToken));
    assert.ok(!records.includes(grant.split("=")[1]));
    assert.equal(
      (await setup.GET(request("/api/accounts/invitation", undefined, grant)))
        .status,
      200,
    );
    assert.equal(
      (await setup.GET(request("/api/accounts/invitation"))).status,
      400,
    );
    const password = "Invitation-test-password-123";
    const mismatch = await activation.POST(
      request(
        "/api/accounts/activate",
        { name: "Actual Owner", password, confirmPassword: "Mismatch" },
        grant,
      ),
    );
    assert.equal(mismatch.status, 400);
    assert.equal(
      (await setup.GET(request("/api/accounts/invitation", undefined, grant)))
        .status,
      200,
    );
    assert.equal(
      (
        await activation.POST(
          request(
            "/api/accounts/activate",
            {
              name: "Actual Owner",
              password: "password123456",
              confirmPassword: "password123456",
            },
            grant,
          ),
        )
      ).status,
      400,
    );
    const ownerActivation = await activation.POST(
      request(
        "/api/accounts/activate",
        {
          name: "Actual Owner",
          password,
          confirmPassword: password,
          email: "attacker@example.test",
          role: "Staff",
        },
        grant,
      ),
    );
    assert.equal(ownerActivation.status, 200);
    const ownerResult = await ownerActivation.json();
    assert.equal(ownerResult.authenticated, true);
    assert.equal(ownerResult.redirectTo, "/dashboard");
    const ownerCookie = cookies(ownerActivation);
    const owner = identity("owner@example.test");
    assert.equal(owner.name, "Actual Owner");
    assert.equal(member(owner.id).role, "Owner");
    assert.ok(await viewer(new Headers({ cookie: ownerCookie })));
    assert.equal(
      (
        await setup.POST(
          request("/api/accounts/invitation", { token: ownerToken }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await activation.POST(
          request(
            "/api/accounts/activate",
            { name: "Again", password, confirmPassword: password },
            grant,
          ),
        )
      ).status,
      400,
    );
    function invitation(
      email: string,
      role = "Staff",
      status = "Pending Invitation",
      expires = Date.now() + 60000,
    ) {
      const token = randomBytes(32).toString("base64url");
      db.prepare(
        "INSERT INTO invitations(id,email,name,role,permissions,token_hash,expires_at,status,created_by) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        randomUUID(),
        email,
        "Invited Name",
        role,
        JSON.stringify(defaults(role as "Staff")),
        tokenHash(token),
        expires,
        status,
        owner.id,
      );
      return token;
    }
    const staffToken = invitation("staff@example.test");
    const staffSetup = await setup.POST(
      request("/api/accounts/invitation", { token: staffToken, owner: true }),
    );
    assert.equal((await staffSetup.clone().json()).role, "Staff");
    const staffGrant = cookies(staffSetup);
    const payload = {
      name: "Actual Staff",
      password,
      confirmPassword: password,
      role: "Owner",
      permissions: defaults("Owner"),
      owner: true,
      email: "different@example.test",
    };
    const races = await Promise.all([
      activation.POST(request("/api/accounts/activate", payload, staffGrant)),
      activation.POST(request("/api/accounts/activate", payload, staffGrant)),
    ]);
    assert.deepEqual(races.map((r) => r.status).sort(), [200, 400]);
    const staff = identity("staff@example.test");
    assert.equal(member(staff.id).role, "Staff");
    assert.equal(staff.name, "Actual Staff");
    assert.equal(identity("different@example.test"), undefined);
    for (const [email, status, expiry] of [
      ["expired@example.test", "Pending Invitation", Date.now() - 1],
      ["revoked@example.test", "Revoked", Date.now() + 60000],
      ["used@example.test", "Accepted", Date.now() + 60000],
    ] as const) {
      const token = invitation(email, "Staff", status, expiry);
      assert.equal(
        (await setup.POST(request("/api/accounts/invitation", { token })))
          .status,
        400,
      );
    }
    assert.equal(
      (
        await setup.POST(
          request("/api/accounts/invitation", {
            token: randomBytes(32).toString("base64url"),
            owner: true,
          }),
        )
      ).status,
      400,
    );
    // A provider identity with a pending invitation can authenticate, but has no
    // inventory access until it accepts the matching invitation.
    const ctx = await auth.$context;
    const existing = await ctx.internalAdapter.createUser(
      {
        name: "Existing person",
        email: "existing@example.test",
        emailVerified: true,
      },
      { method: "admin" },
    );
    const hash = await ctx.password.hash(password);
    await ctx.internalAdapter.createAccount({
      userId: existing.id,
      accountId: existing.id,
      providerId: "credential",
      password: hash,
    });
    const existingToken = invitation(existing.email, "Manager");
    const existingSetup = await setup.POST(
      request("/api/accounts/invitation", { token: existingToken }),
    );
    assert.equal((await existingSetup.clone().json()).existingUser, true);
    const existingGrant = cookies(existingSetup),
      totalUsers = (
        db.prepare("SELECT COUNT(*) n FROM user").get() as { n: number }
      ).n;
    assert.equal(
      (
        await activation.POST(
          request(
            "/api/accounts/activate",
            { name: "Existing person" },
            existingGrant,
          ),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await activation.POST(
          request(
            "/api/accounts/activate",
            { name: "Existing person" },
            existingGrant + "; " + ownerCookie,
          ),
        )
      ).status,
      409,
    );
    const existingLogin = await authRoute.POST(
      request("/api/auth/sign-in/email", { email: existing.email, password }),
    );
    assert.equal(existingLogin.status, 200);
    const existingCookie = cookies(existingLogin);
    assert.equal(await viewer(new Headers({ cookie: existingCookie })), null);
    const products = await import("../app/api/products/route");
    assert.equal(
      (await products.GET(request("/api/products", undefined, existingCookie)))
        .status,
      401,
    );
    const matching = await setup.GET(
      request(
        "/api/accounts/invitation",
        undefined,
        existingGrant + "; " + existingCookie,
      ),
    );
    assert.equal((await matching.json()).authenticated, true);
    const accepted = await activation.POST(
      request(
        "/api/accounts/activate",
        { name: "Existing person" },
        existingGrant + "; " + existingCookie,
      ),
    );
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).redirectTo, "/dashboard");
    assert.equal(
      (db.prepare("SELECT COUNT(*) n FROM user").get() as { n: number }).n,
      totalUsers,
    );
    assert.equal(member(existing.id).role, "Manager");
    assert.ok(await viewer(new Headers({ cookie: existingCookie })));
    assert.equal(
      (
        db
          .prepare(
            "SELECT password FROM account WHERE userId=? AND providerId='credential'",
          )
          .get(existing.id) as { password: string }
      ).password,
      hash,
    );
    assert.deepEqual(counts(), original);
    // Invalid activation attempts do not leak tokens or passwords to audit rows.
    const logs = JSON.stringify(db.prepare("SELECT * FROM audit_logs").all());
    assert.ok(!logs.includes(password));
    assert.ok(!logs.includes(staffToken));
    const replacement =
      await import("../app/api/accounts/invitation/request/route");
    assert.equal(
      (
        await replacement.POST(
          request("/api/accounts/invitation/request", {
            email: "staff@example.test",
          }),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        db
          .prepare("SELECT status FROM invitation_requests WHERE email=?")
          .get("staff@example.test") as { status: string }
      ).status,
      "Pending",
    );
    assert.equal(
      (await validateInvitation(invitation("another@example.test"))).role,
      "Staff",
    );
  } finally {
    db.close();
    for (const key of [
      "KEENVENTORY_DATA_DIR",
      "BETTER_AUTH_URL",
      "BETTER_AUTH_SECRET",
    ])
      delete process.env[key];
    rmSync(folder, { recursive: true, force: true });
  }
});

test("optional breached-password checks send only a hash prefix and reject compromised choices", async () => {
  const { checkNewPassword } = await import("./passwordPolicy");
  const original = globalThis.fetch;
  process.env.KEENVENTORY_CHECK_BREACHED_PASSWORDS = "true";
  try {
    const password = "A-unique-test-password";
    const hash = createHash("sha1")
      .update(password)
      .digest("hex")
      .toUpperCase();
    globalThis.fetch = async (input, init) => {
      assert.equal(
        String(input),
        "https://api.pwnedpasswords.com/range/" + hash.slice(0, 5),
      );
      assert.equal(init?.body, undefined);
      return new Response(hash.slice(5) + ":1");
    };
    await assert.rejects(() => checkNewPassword(password), /known breaches/);
  } finally {
    globalThis.fetch = original;
    delete process.env.KEENVENTORY_CHECK_BREACHED_PASSWORDS;
  }
});
