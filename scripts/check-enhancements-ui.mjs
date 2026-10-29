import "next/dist/server/node-environment-baseline.js";
import { chromium } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import next from "next";
const folder = mkdtempSync(path.join(tmpdir(), "keenventory-invitation-ui-"));
const base = "http://localhost:3101";
const typeConfig = readFileSync("tsconfig.json", "utf8"),
  nextEnv = readFileSync("next-env.d.ts", "utf8");
Object.assign(process.env, {
  NODE_ENV: "development",
  KEENVENTORY_UI_TEST: "true",
  KEENVENTORY_DATA_DIR: folder,
  BETTER_AUTH_URL: base,
  BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
  SMTP_HOST: "",
  SMTP_FROM: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  KEENVENTORY_CHECK_BREACHED_PASSWORDS: "false",
});
const config = (await import("../next.config.mjs")).default;
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

  await page.setViewportSize({ width: 1440, height: 1050 });
  await page
    .getByRole("button", { name: "Content Calendar", exact: true })
    .click();
  const month = page.getByLabel("Calendar month and year");
  const current = await month.inputValue();
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  assert.notEqual(await month.inputValue(), current);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  assert.equal(await month.inputValue(), current);
  await page.getByRole("button", { name: "Add Content", exact: true }).click();
  await page
    .getByLabel("Content Title", { exact: true })
    .fill("Browser content launch");
  await page
    .getByLabel("Caption / Description", { exact: true })
    .fill("Launch caption");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Content form", exact: true })
    .waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Browser content launch", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Mark as Published", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Status", { exact: true }).inputValue(),
    "Published",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Content Calendar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Browser content launch", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Event details" })
    .getByText("Published", { exact: true })
    .waitFor();
  await page
    .getByRole("dialog", { name: "Event details" })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/content-calendar.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page
    .getByRole("button", { name: "Calendar View", exact: true })
    .click();
  await page.getByRole("button", { name: "Add Event", exact: true }).click();
  await page
    .getByLabel("Event Title", { exact: true })
    .fill("Browser standalone event");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Event form", exact: true })
    .waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Browser standalone event", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Browser standalone event", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("dialog", { name: "Event details", exact: true })
    .waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Reports & Analytics", exact: true })
    .click();
  await page.getByLabel("Date Range", { exact: true }).selectOption("All Time");
  await page.getByLabel("Report Type", { exact: true }).selectOption("orders");
  await page.getByLabel("Chart Type", { exact: true }).selectOption("line");
  await page.getByRole("link", { name: /Export Report.*CSV/ }).waitFor();
  for (const format of ["CSV", "XLSX", "PDF"]) {
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("link", { name: new RegExp("Export Report.*" + format) })
      .click();
    await downloadPromise;
  }
  const PDFDocument = (await import("pdfkit")).default,
    document = new PDFDocument(),
    chunks = [];
  const bytes = new Promise((resolve) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
  });
  document
    .text("Order # PDF-BROWSER-1")
    .text("2026-10-29")
    .text("customer@example.test")
    .text("Review product lines before importing.");
  document.end();
  const extracted = await context.request.post(base + "/api/imports", {
    headers: { origin: base },
    multipart: {
      kind: "orders",
      file: {
        name: "browser-order.pdf",
        mimeType: "application/pdf",
        buffer: await bytes,
      },
    },
  });
  assert.equal(extracted.status(), 200, await extracted.text());
  const pdfReview = await extracted.json();
  assert.match(pdfReview.extracted_text, /PDF-BROWSER-1/);
  assert.equal(pdfReview.rows[0]["Fulfillment Status"], "Draft");
  await page.screenshot({ path: "artifacts/reports.png", fullPage: true });
  await page.getByRole("button", { name: "Products", exact: true }).click();
  await page
    .getByRole("button", { name: "Import Products", exact: true })
    .click();
  await page.getByLabel("Upload Document", { exact: true }).setInputFiles({
    name: "browser-products.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Product Name,SKU,Stock Quantity,Cost Price\nBrowser imported candle,BROWSER-IMPORTED,2,4\n",
    ),
  });
  await page
    .getByRole("button", { name: "Apply Mapping", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Validate & Preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm Import", exact: true })
    .waitFor();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Confirm Import", exact: true })
    .click();
  await page.getByText("Import completed.", { exact: true }).waitFor();
  await page
    .getByRole("dialog", { name: "Import products", exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.getByRole("button", { name: "Recipes", exact: true }).click();
  assert.equal(
    await page
      .getByRole("heading", { name: "New Recipe", exact: true })
      .count(),
    0,
  );
  await page.getByRole("link", { name: "Create Recipe", exact: true }).click();
  await page.waitForURL("**/recipes/new");
  await page.getByLabel("Recipe name", { exact: true }).fill("Browser recipe");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Recipe description");
  await page.getByRole("button", { name: "Add Material", exact: true }).click();
  await page.getByLabel("material name 1", { exact: true }).fill("Candle Wax");
  await page.getByRole("button", { name: "Save Recipe", exact: true }).click();
  await page.waitForFunction(() => /^\/recipes\/\d+$/.test(location.pathname), {
    timeout: 60000,
  });
  await page
    .getByRole("heading", { name: "Browser recipe", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "Edit Recipe", exact: true }).click();
  await page.waitForFunction(() =>
    /^\/recipes\/\d+\/edit$/.test(location.pathname),
  );
  assert.equal(
    await page.getByLabel("Recipe name", { exact: true }).inputValue(),
    "Browser recipe",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/recipe-editor-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Enhancement browser checks passed: calendar navigation, content create/publish/refresh, report controls, CSV/Excel/PDF downloads and PDF document extraction, product import, recipe create/detail/edit, and mobile layout.",
  );
} catch (error) {
  failed = true;
  console.error(error.stack);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await app.close();
  db.close();
  const normalize = (value) => ({
    ...value,
    include: value.include
      .filter((p) => p !== ".next-invitation-test/types/**/*.ts")
      .sort(),
  });
  if (
    JSON.stringify(
      normalize(JSON.parse(readFileSync("tsconfig.json", "utf8"))),
    ) === JSON.stringify(normalize(JSON.parse(typeConfig)))
  )
    writeFileSync("tsconfig.json", typeConfig);
  if (
    readFileSync("next-env.d.ts", "utf8").replace(
      "./.next-invitation-test/types/routes.d.ts",
      "./.next/types/routes.d.ts",
    ) === nextEnv
  )
    writeFileSync("next-env.d.ts", nextEnv);
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
