import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { setupTestOwner } from "./authTestSupport";
import { defaults } from "./permissions";

test("private accounts, invitations, recovery, backend permissions, workspace binding, revocation and audit", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "keenventory-accounts-"));
  process.env.KEENVENTORY_DATA_DIR = folder;
  const messages: string[] = [];
  const server = createServer((socket) => {
    socket.write("220 localhost test SMTP\r\n");
    let buffer = "",
      data = false,
      mail = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes("\r\n")) {
        const index = buffer.indexOf("\r\n"),
          line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (data) {
          if (line === ".") {
            messages.push(mail);
            mail = "";
            data = false;
            socket.write("250 delivered\r\n");
          } else mail += line + "\r\n";
        } else if (/^EHLO|^HELO/.test(line)) socket.write("250 localhost\r\n");
        else if (/^DATA/.test(line)) {
          data = true;
          socket.write("354 send message\r\n");
        } else if (/^QUIT/.test(line)) {
          socket.end("221 goodbye\r\n");
        } else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  Object.assign(process.env, {
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(address.port),
    SMTP_FROM: "Keenventory <test@example.test>",
  });
  const owner = await setupTestOwner();
  const { db } = await import("./db");
  try {
    const { authentication } = await import("./auth");
    const auth = await authentication();
    const { activate, tokenHash, updateMembership, invite } =
      await import("./accounts");
    const { viewer } = await import("./access");
    const ownerViewer = (await viewer(new Headers({ cookie: owner.cookie })))!;
    const productRoute = await import("../app/api/products/route");
    const actions = await import("../app/api/products/actions/route");
    const dashboard = await import("../app/api/dashboard/route");
    const authRoute = await import("../app/api/auth/[...all]/route");
    const request = (
      url: string,
      method = "GET",
      body?: unknown,
      cookie = owner.cookie,
      origin = "http://localhost",
    ) =>
      new Request("http://localhost" + url, {
        method,
        headers: { cookie, origin, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    assert.equal(
      (await productRoute.GET(request("/api/products", "GET", undefined, "")))
        .status,
      401,
    );
    assert.equal(
      (
        await productRoute.POST(
          request(
            "/api/products",
            "POST",
            { name: "Forged", sku: "FORGED" },
            owner.cookie,
            "https://evil.test",
          ),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await authRoute.POST(
          request("/api/auth/sign-up/email", "POST", {
            name: "Public user",
            email: "public@example.test",
            password: "Public-password-123",
          }),
        )
      ).status,
      404,
    );
    const bad = await authRoute.POST(
      request("/api/auth/sign-in/email", "POST", {
        email: owner.email,
        password: "Wrong-password-123",
      }),
    );
    assert.equal(bad.status, 401);
    assert.match(await bad.text(), /Unable to sign in/);
    const { saveProduct, product } = await import("./productStore");
    const productId = saveProduct(db, {
      name: "Private candle",
      sku: "PRIVATE-TEST",
      stock_quantity: 5,
      cost_per_unit: 17,
      retail_price: 45,
    });
    await invite(ownerViewer, {
      name: "Staff user",
      email: "staff@example.test",
      role: "Staff",
      permissions: defaults("Staff"),
    });
    assert.equal(messages.length, 1);
    assert.match(messages[0], /You're Invited to Keenventory/);
    const mail = messages[0].replace(/=\r\n/g, "").replace(/=3D/g, "=");
    const token = mail.match(/accept-invitation\?token=([A-Za-z0-9_-]+)/)![1];
    const password = "Staff-test-password-123";
    await activate({
      token,
      password,
      role: "Owner",
      permissions: defaults("Owner"),
    });
    await assert.rejects(
      () => activate({ token, password }),
      /invalid.*expired/,
    );
    const staffLogin = await auth.api.signInEmail({
      body: { email: "staff@example.test", password },
      asResponse: true,
    });
    assert.equal(staffLogin.status, 200);
    const staffCookie = staffLogin.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const staff = (await viewer(new Headers({ cookie: staffCookie })))!;
    assert.equal(staff.role, "Staff");
    const privateData = await (
      await productRoute.GET(
        request("/api/products", "GET", undefined, staffCookie),
      )
    ).json();
    const candle = privateData.products.find(
      (p: { id: number }) => p.id === productId,
    );
    assert.equal(candle.cost_per_unit, undefined);
    assert.equal(candle.retail_price, undefined);
    const overviewResponse = await dashboard.GET(
      request("/api/dashboard", "GET", undefined, staffCookie),
    );
    assert.equal(overviewResponse.status, 200);
    const overview = await overviewResponse.json();
    assert.deepEqual(overview.purchaseOrders, []);
    assert.equal(overview.summary.totalInventoryValue, undefined);
    assert.deepEqual(overview.chartData.inventory, []);
    assert.equal(
      (
        await productRoute.POST(
          request(
            "/api/products",
            "POST",
            { name: "Unauthorized", sku: "UNAUTHORIZED" },
            staffCookie,
          ),
        )
      ).status,
      403,
    );
    const users = await import("../app/api/accounts/users/route");
    assert.equal(
      (
        await users.GET(
          request("/api/accounts/users", "GET", undefined, staffCookie),
        )
      ).status,
      403,
    );
    const report = await import("../app/api/products/export/route");
    assert.equal(
      (
        await report.GET(
          request(
            "/api/products/export?report=stock",
            "GET",
            undefined,
            staffCookie,
          ),
        )
      ).status,
      403,
    );
    const push = await import("../app/api/products/shopify/route");
    assert.equal(
      (
        await push.POST(
          request(
            "/api/products/shopify",
            "POST",
            { id: productId, action: "push" },
            staffCookie,
          ),
        )
      ).status,
      403,
    );
    const take = await import("../app/api/stocktakes/route");
    assert.equal(
      (
        await take.POST(
          request(
            "/api/stocktakes",
            "POST",
            {
              inventory_name: "Private candle",
              location: "Main Storage",
              actual_quantity: 5,
            },
            staffCookie,
          ),
        )
      ).status,
      200,
    );
    db.prepare(
      "UPDATE organization_memberships SET permissions=? WHERE user_id=?",
    ).run(
      JSON.stringify({ ...defaults("Staff"), products: ["view", "edit"] }),
      staff.id,
    );
    assert.equal(
      (
        await productRoute.POST(
          request(
            "/api/products",
            "POST",
            { id: productId, name: "Updated description" },
            staffCookie,
          ),
        )
      ).status,
      200,
    );
    assert.equal(product(db, productId).retail_price, 45);
    assert.equal(product(db, productId).cost_per_unit, 17);
    assert.equal(
      (
        await productRoute.POST(
          request(
            "/api/products",
            "POST",
            { id: productId, retail_price: 0 },
            staffCookie,
          ),
        )
      ).status,
      403,
    );
    const untyped = new Request("http://localhost/api/products", {
      method: "POST",
      headers: { cookie: staffCookie, origin: "http://localhost" },
      body: JSON.stringify({ id: productId, retail_price: 0 }),
    });
    assert.equal((await productRoute.POST(untyped)).status, 415);
    // Managers can complete production while server-owned rates stay private.
    db.prepare(
      "UPDATE organization_memberships SET role='Manager',permissions=? WHERE user_id=?",
    ).run(JSON.stringify(defaults("Manager")), staff.id);
    const productionProduct = saveProduct(db, {
      name: "Production access test",
      sku: "AUTH-PRODUCTION",
    });
    const ingredient = db
      .prepare(
        "INSERT INTO materials(name,sku,unit,stock_quantity,cost_per_unit,category) VALUES('Test wax','AUTH-MATERIAL','oz',10,7,'Wax')",
      )
      .run();
    const recipe = db
      .prepare(
        "INSERT INTO recipes(name,product_id,batch_yield,status,hourly_labor_rate) VALUES('Access test recipe',?,1,'Active',30)",
      )
      .run(productionProduct);
    db.prepare(
      "INSERT INTO recipe_items(recipe_id,material_id,item_name,quantity,unit) VALUES(?,?,'Test wax',1,'oz')",
    ).run(recipe.lastInsertRowid, ingredient.lastInsertRowid);
    const manufacturing = await import("../app/api/manufacturing/route");
    const createdBatch = await manufacturing.POST(
      request(
        "/api/manufacturing",
        "POST",
        {
          product_id: productionProduct,
          recipe_id: Number(recipe.lastInsertRowid),
          planned_quantity: 1,
          request_key: randomUUID(),
        },
        staffCookie,
      ),
    );
    assert.equal(createdBatch.status, 200);
    const batchId = (await createdBatch.json()).id;
    const batches = await (
      await manufacturing.GET(
        request("/api/manufacturing", "GET", undefined, staffCookie),
      )
    ).json();
    const snapshot = JSON.parse(
      batches.batches.find((b: { id: number }) => b.id === batchId)
        .recipe_snapshot,
    );
    assert.equal(snapshot.hourly_labor_rate, undefined);
    const completed = await manufacturing.PATCH(
      request(
        "/api/manufacturing",
        "PATCH",
        {
          id: batchId,
          actual_quantity: 1,
          actual_minutes: 2,
          consumption: [
            { material_id: Number(ingredient.lastInsertRowid), quantity: 1 },
          ],
        },
        staffCookie,
      ),
    );
    assert.equal(completed.status, 200);
    assert.equal(product(db, productionProduct).stock_quantity, 1);
    // Even explicit overrides cannot turn a View Only membership into a writer.
    db.prepare(
      "UPDATE organization_memberships SET role='View Only',permissions=? WHERE user_id=?",
    ).run(
      JSON.stringify({
        products: ["view", "create"],
        adjustments: ["view", "create"],
      }),
      staff.id,
    );
    assert.equal(
      (
        await actions.POST(
          request(
            "/api/products/actions",
            "POST",
            {
              id: productId,
              action: "adjust",
              location: "Finished Goods Storage",
              quantity: 1,
              reason: "Unauthorized",
              request_key: randomUUID(),
            },
            staffCookie,
          ),
        )
      ).status,
      403,
    );
    assert.equal(product(db, productId).stock_quantity, 5);
    await assert.rejects(
      () =>
        updateMembership(ownerViewer, {
          id: ownerViewer.id,
          action: "disable",
        }),
      /at least one active owner/,
    );
    await updateMembership(ownerViewer, { id: staff.id, action: "disable" });
    assert.equal(await viewer(new Headers({ cookie: staffCookie })), null);
    assert.equal(
      (
        await productRoute.GET(
          request("/api/products", "GET", undefined, staffCookie),
        )
      ).status,
      401,
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE products SET organization_id=2 WHERE id=?")
          .run(productId),
      /CHECK/,
    );
    assert.throws(
      () =>
        db
          .prepare("INSERT INTO organizations VALUES(2,'Other business')")
          .run(),
      /CHECK/,
    );
    assert.throws(
      () => db.prepare("DELETE FROM audit_logs").run(),
      /immutable/,
    );
    const audit = db.prepare("SELECT details FROM audit_logs").all() as {
      details: string;
    }[];
    assert.ok(audit.length >= 10);
    assert.ok(!JSON.stringify(audit).includes(password));
    const expired = randomBytes(32).toString("base64url");
    db.prepare(
      "INSERT INTO invitations(id,email,name,role,permissions,token_hash,expires_at,created_by) VALUES(?,?,?,?,?,?,?,?)",
    ).run(
      randomUUID(),
      "expired@example.test",
      "Expired",
      "Staff",
      "{}",
      tokenHash(expired),
      Date.now() - 1,
      ownerViewer.id,
    );
    await assert.rejects(
      () => activate({ token: expired, password }),
      /invalid.*expired/,
    );
    // Recovery email is delivered; reset revokes every existing provider session.
    const reset = await authRoute.POST(
      request("/api/auth/request-password-reset", "POST", {
        email: owner.email,
        redirectTo: "/reset-password",
      }),
    );
    assert.equal(reset.status, 200);
    const resetMail = messages[messages.length - 1]
      .replace(/=\r\n/g, "")
      .replace(/=3D/g, "=");
    const resetToken = resetMail.match(/reset-password\/([A-Za-z0-9_-]+)/)![1];
    const newPassword = "Updated-owner-password-123";
    const changed = await authRoute.POST(
      request("/api/auth/reset-password", "POST", {
        token: resetToken,
        newPassword,
      }),
    );
    assert.equal(changed.status, 200);
    assert.equal(await viewer(new Headers({ cookie: owner.cookie })), null);
    assert.notEqual(
      (
        await authRoute.POST(
          request("/api/auth/reset-password", "POST", {
            token: resetToken,
            newPassword,
          }),
        )
      ).status,
      200,
    );
    const nextLogin = await auth.api.signInEmail({
      body: { email: owner.email, password: newPassword },
      asResponse: true,
    });
    assert.equal(nextLogin.status, 200);
    const nextCookie = nextLogin.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const enrollment = await authRoute.POST(
      request(
        "/api/auth/two-factor/enable",
        "POST",
        { password: newPassword },
        nextCookie,
      ),
    );
    assert.equal(enrollment.status, 200);
    const enrollmentData = await enrollment.json();
    assert.equal(enrollmentData.backupCodes.length, 10);
    const { createOTP } = await import("@better-auth/utils/otp");
    const { base32 } = await import("@better-auth/utils/base32");
    const secret = new URL(enrollmentData.totpURI).searchParams.get("secret")!;
    const totp = await createOTP(base32.decode(secret)).totp();
    const verification = await authRoute.POST(
      request(
        "/api/auth/two-factor/verify-totp",
        "POST",
        { code: totp },
        nextCookie,
      ),
    );
    assert.equal(verification.status, 200);
    const protectedLogin = await authRoute.POST(
      request("/api/auth/sign-in/email", "POST", {
        email: owner.email,
        password: newPassword,
      }),
    );
    assert.equal(protectedLogin.status, 200);
    assert.equal((await protectedLogin.json()).twoFactorRedirect, true);
    const challengeCookie = protectedLogin.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    assert.equal(await viewer(new Headers({ cookie: challengeCookie })), null);
    const challenge = await authRoute.POST(
      request(
        "/api/auth/two-factor/verify-totp",
        "POST",
        { code: totp },
        challengeCookie,
      ),
    );
    assert.equal(challenge.status, 200);
    const mfaCookie = challenge.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    assert.ok(await viewer(new Headers({ cookie: mfaCookie })));
    await authRoute.POST(request("/api/auth/sign-out", "POST", {}, mfaCookie));
    const logout = await authRoute.POST(
      request("/api/auth/sign-out", "POST", {}, nextCookie),
    );
    assert.equal(logout.status, 200);
    assert.equal(await viewer(new Headers({ cookie: nextCookie })), null);
    // Rate limits are persistent and generic.
    for (let i = 0; i < 11; i++)
      await authRoute.POST(
        request("/api/auth/sign-in/email", "POST", {
          email: "nobody@example.test",
          password: "bad-password-123",
        }),
      );
    assert.equal(
      (
        await authRoute.POST(
          request("/api/auth/sign-in/email", "POST", {
            email: "nobody@example.test",
            password: "bad-password-123",
          }),
        )
      ).status,
      429,
    );
  } finally {
    db.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const key of [
      "KEENVENTORY_DATA_DIR",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_FROM",
      "BETTER_AUTH_URL",
      "BETTER_AUTH_SECRET",
    ])
      delete process.env[key];
    rmSync(folder, { recursive: true, force: true });
  }
});
