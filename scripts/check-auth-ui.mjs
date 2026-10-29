import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3100/");
  await page.waitForURL("**/login");
  await page
    .getByRole("heading", { name: "Keenventory", exact: true })
    .waitFor();
  await page.getByLabel("Email Address").fill("unknown@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Wrong-password-123");
  await page.getByRole("button", { name: "Show password" }).click();
  assert.equal(
    await page.getByLabel("Password", { exact: true }).getAttribute("type"),
    "text",
  );
  await page.getByRole("button", { name: "Hide password" }).click();
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page
    .getByText(
      "Unable to sign in. Check your credentials or try again later.",
      { exact: true },
    )
    .waitFor();
  assert.match(
    await page
      .getByText(
        "Unable to sign in. Check your credentials or try again later.",
        { exact: true },
      )
      .innerText(),
    /Unable to sign in/,
  );
  assert.equal(
    await page
      .getByAltText("Keen Scents Handmade")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  assert.equal(
    (await page.request.get("http://localhost:3100/api/products")).status(),
    401,
  );
  await page.goto("http://localhost:3100/settings/users");
  await page.waitForURL("**/login");
  await fs.mkdir("artifacts", { recursive: true });
  // Screenshots show the application without Next.js development chrome.
  await page.addStyleTag({content:'nextjs-portal { display: none !important; }'});
  await page.screenshot({
    path: "artifacts/login-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/login-mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: login redirect, logo, password visibility, safe failure, API denial, settings protection, and mobile layout.",
  );
} finally {
  await browser.close();
}
