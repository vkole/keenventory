import "next/dist/server/node-environment-baseline.js";
import { chromium } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import next from "next";
import config from "../next.config.mjs";
const folder = mkdtempSync(path.join(tmpdir(), "keenventory-invitation-ui-"));
const base = "http://localhost:3101";
Object.assign(process.env, {
  NODE_ENV: "development",
  KEENVENTORY_DATA_DIR: folder,
  BETTER_AUTH_URL: base,
  BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
  SMTP_HOST: "",
  SMTP_FROM: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  KEENVENTORY_CHECK_BREACHED_PASSWORDS: "false",
});
const { db } = await import("../lib/db.ts");
const { authentication } = await import("../lib/auth.ts");
const { tokenHash } = await import("../lib/accounts.ts");
const { defaults } = await import("../lib/permissions.ts");
const auth = await authentication();
const ownerToken = randomBytes(32).toString("base64url");
db.prepare(
  "INSERT INTO owner_claims(id,email,name,token_hash,expires_at) VALUES(1,?,?,?,?)",
).run(
  "owner@example.test",
  "Invited Owner",
  tokenHash(ownerToken),
  Date.now() + 600000,
);
function invitation(email, role = "Staff", expires = Date.now() + 600000) {
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO invitations(id,email,name,role,permissions,token_hash,expires_at,created_by) VALUES(?,?,?,?,?,?,?,?)",
  ).run(
    randomUUID(),
    email,
    "Invited Team Member",
    role,
    JSON.stringify(defaults(role)),
    tokenHash(token),
    expires,
    "ui-fixture",
  );
  return token;
}
const staffToken = invitation("staff@example.test");
const expiredToken = invitation(
  "expired@example.test",
  "Staff",
  Date.now() - 1000,
);
const password = "Browser-test-password-123";
const ctx = await auth.$context;
const existing = await ctx.internalAdapter.createUser(
  {
    name: "Existing Team Member",
    email: "existing@example.test",
    emailVerified: true,
  },
  { method: "admin" },
);
await ctx.internalAdapter.createAccount({
  userId: existing.id,
  accountId: existing.id,
  providerId: "credential",
  password: await ctx.password.hash(password),
});
const existingToken = invitation(existing.email, "Manager");
const app = next({
  dev: true,
  hostname: "localhost",
  port: 3101,
  conf: { ...config, distDir: ".next-invitation-test", devIndicators: false },
});
await app.prepare();
const server = createServer(app.getRequestHandler());
await new Promise((resolve) => server.listen(3101, resolve));
const browser = await chromium.launch({ channel: "msedge", headless: true });
let failed = false;
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/accept-invitation?owner=1&token=" + ownerToken);
  await page.getByLabel("Email Address", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Email Address", { exact: true }).inputValue(),
    "owner@example.test",
  );
  assert.equal(
    await page
      .getByLabel("Email Address", { exact: true })
      .getAttribute("readonly"),
    "",
  );
  assert.equal(
    await page.getByLabel("Invitation role").innerText(),
    "Owner Invitation",
  );
  await page.waitForFunction(
    () => !new URL(location.href).searchParams.has("token"),
  );
  assert.ok(
    (await context.cookies(base + "/api/accounts/invitation")).find(
      (c) => c.name === "keenventory.invitation" && c.httpOnly,
    ),
  );
  await page.reload();
  await page.getByLabel("Email Address", { exact: true }).waitFor();
  await mkdir("artifacts", { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal {display:none!important}" });
  await page.screenshot({
    path: "artifacts/account-setup-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/account-setup-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByLabel("Full Name", { exact: true }).fill("Actual Owner");
  await page.getByLabel("Create Password", { exact: true }).fill(password);
  await page
    .getByLabel("Confirm Password", { exact: true })
    .fill("Different-password-123");
  await page
    .getByRole("button", { name: "Show password", exact: true })
    .click();
  assert.equal(
    await page
      .getByLabel("Create Password", { exact: true })
      .getAttribute("type"),
    "text",
  );
  await page
    .getByRole("button", { name: "Activate My Account", exact: true })
    .click();
  await page.getByText("Passwords must match.", { exact: true }).waitFor();
  await page.getByLabel("Confirm Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Activate My Account", exact: true })
    .click();
  await page
    .getByText("Your Keenventory account has been successfully created.", {
      exact: true,
    })
    .waitFor();
  await page.waitForURL(base + "/dashboard", { timeout: 60000 });
  await page
    .getByRole("heading", { name: "Keenventory Dashboard", exact: true })
    .waitFor();
  const other = await browser.newContext(),
    otherPage = await other.newPage();
  await otherPage.goto(base + "/dashboard");
  await otherPage.waitForURL("**/login");
  await otherPage.goto(base + "/accept-invitation?owner=1&token=" + staffToken);
  await otherPage.getByLabel("Invitation role").waitFor();
  assert.equal(
    await otherPage.getByLabel("Invitation role").innerText(),
    "Staff Invitation",
  );
  await otherPage.goto(base + "/accept-invitation?token=" + expiredToken);
  await otherPage
    .getByRole("heading", { name: "Invitation Unavailable" })
    .waitFor();
  assert.equal(
    await otherPage.getByLabel("Create Password", { exact: true }).count(),
    0,
  );
  await otherPage
    .getByLabel("Email Address", { exact: true })
    .fill("requested@example.test");
  await otherPage
    .getByRole("button", { name: "Request a New Invitation" })
    .click();
  await otherPage.getByText(/Your request has been recorded/).waitFor();
  assert.ok(
    db
      .prepare("SELECT email FROM invitation_requests WHERE email=?")
      .get("requested@example.test"),
  );
  await otherPage.goto(base + "/forgot-password");
  await otherPage
    .getByRole("heading", { name: "Reset your password" })
    .waitFor();
  await otherPage.goto(base + "/accept-invitation?token=" + existingToken);
  await otherPage
    .getByText(
      "An account already exists for this email. Sign in to accept your invitation.",
    )
    .waitFor();
  assert.equal(
    await otherPage.getByLabel("Confirm Password", { exact: true }).count(),
    0,
  );
  await otherPage.getByLabel("Password", { exact: true }).fill(password);
  await otherPage
    .getByRole("button", { name: "Activate My Account", exact: true })
    .click();
  await otherPage.waitForURL(base + "/dashboard", { timeout: 60000 });
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM user WHERE email=?").get(existing.email)
      .n,
    1,
  );
  assert.equal(
    db
      .prepare("SELECT role FROM organization_memberships WHERE user_id=?")
      .get(existing.id).role,
    "Manager",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Invitation browser checks passed: verified metadata, refresh, token removal, mobile layout, password validation, owner activation, role forgery prevention, expiry, replacement requests, existing-user sign-in, and protected dashboard.",
  );
} catch (error) {
  failed = true;
  console.error(error.stack);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await app.close();
  db.close();
  if (path.dirname(folder) === tmpdir()) {
    try {
      rmSync(folder, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    } catch {
      /* Next.js can retain SQLite handles until process exit on Windows. */
    }
  }
}

process.exit(failed ? 1 : 0);
