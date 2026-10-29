import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import {
  ownerConfigurationIssues,
  ownerSetupFailure,
  localRenderTarget,
} from "./ownerSetupDiagnostics";
test("owner diagnostics identify configuration and SMTP errors without printing secrets", () => {
  const secret = "private-password-and-token";
  const issues = ownerConfigurationIssues({
    BETTER_AUTH_URL: "https://keenventory.onrender.com",
    SMTP_USER: "user@example.test",
    SMTP_PASSWORD: secret,
  });
  assert.ok(issues.some((s) => s.includes("BETTER_AUTH_SECRET")));
  assert.ok(issues.some((s) => s.includes("SMTP_HOST")));
  assert.ok(!issues.join(" ").includes(secret));
  const smtp = Object.assign(new Error("535 credentials " + secret), {
    code: "EAUTH",
    response: secret,
  });
  assert.match(ownerSetupFailure(smtp, "email"), /SMTP authentication failed/);
  assert.ok(!ownerSetupFailure(smtp, "email").includes(secret));
  assert.ok(
    !ownerSetupFailure(
      new Error("invite?token=" + secret),
      "authentication",
    ).includes(secret),
  );
  assert.match(
    ownerSetupFailure({ code: "SQLITE_READONLY" }, "database"),
    /read-only/,
  );
  assert.equal(
    localRenderTarget({ BETTER_AUTH_URL: "https://keenventory.onrender.com" }),
    true,
  );
  assert.equal(
    localRenderTarget({
      BETTER_AUTH_URL: "https://keenventory.onrender.com",
      RENDER: "true",
    }),
    false,
  );
});
test("owner --check sends no mail and local Render claims are rejected before modifying a database", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "keenventory-owner-check-"));
  const workspace = path.join(folder, "workspace");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    KEENVENTORY_DATA_DIR: workspace,
    BETTER_AUTH_URL: "https://keenventory.onrender.com",
    BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
    SMTP_HOST: "smtp.invalid.example",
    SMTP_FROM: "test@example.test",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    RENDER: "",
  };
  try {
    const refused = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/claim-owner.ts",
        "test@example.test",
        "Test Person",
      ],
      { encoding: "utf8", env },
    );
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /running locally/);
    assert.equal(existsSync(path.join(workspace, "keenventory.db")), false);
    const checked = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/claim-owner.ts", "--check"],
      { encoding: "utf8", env },
    );
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /delivery has not been tested/);
    assert.match(checked.stdout, /local checks only/);
    const db = new Database(path.join(workspace, "keenventory.db"));
    try {
      assert.equal(
        (
          db.prepare("SELECT COUNT(*) n FROM owner_claims").get() as {
            n: number;
          }
        ).n,
        0,
      );
      assert.equal(
        (
          db
            .prepare("SELECT COUNT(*) n FROM organization_memberships")
            .get() as { n: number }
        ).n,
        0,
      );
    } finally {
      db.close();
    }
    const missing = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/claim-owner.ts", "--check"],
      { encoding: "utf8", env: { ...env, BETTER_AUTH_SECRET: "" } },
    );
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /BETTER_AUTH_SECRET/);
    assert.ok(!missing.stderr.includes(env.BETTER_AUTH_SECRET!));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
