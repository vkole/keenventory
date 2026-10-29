import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  OwnerSetupError,
  ownerConfigurationIssues,
  localRenderTarget,
  ownerSetupFailure,
  type OwnerSetupStage,
} from "../lib/ownerSetupDiagnostics";
let stage: OwnerSetupStage = "configuration";
let connection: { close: () => void } | undefined;
async function main() {
  const args = process.argv.slice(2),
    check = args.includes("--check");
  const issues = ownerConfigurationIssues(process.env);
  if (issues.length) throw new OwnerSetupError(issues.join("\n"));
  if (localRenderTarget(process.env) && !check)
    throw new OwnerSetupError(
      "BETTER_AUTH_URL points to Render, but this command is running locally. Run it in Render > keenventory > Shell so the invitation is stored in the live database. No invitation was created or emailed.",
    );
  let person: { email: string; name: string } | undefined;
  if (!check) {
    const [email, name] = args;
    if (
      !z
        .object({ email: z.email(), name: z.string().trim().min(1) })
        .safeParse({ email, name }).success
    )
      throw new OwnerSetupError(
        'Usage: node --import tsx scripts/claim-owner.ts email@example.com "Full Name"',
      );
    person = { email: email.toLowerCase(), name: name.trim() };
  }
  stage = "database";
  const { db } = await import("../lib/db");
  connection = db;
  stage = "authentication";
  const { authentication } = await import("../lib/auth");
  await authentication();
  const memberships = (
    db.prepare("SELECT COUNT(*) n FROM organization_memberships").get() as {
      n: number;
    }
  ).n;
  if (check) {
    console.log(
      "Authentication and database checks passed. SMTP configuration fields are present; delivery has not been tested.",
    );
    console.log("Workspace memberships: " + memberships);
    if (localRenderTarget(process.env))
      console.log(
        "WARNING: These are local checks only. Run --check in Render Shell to inspect the live environment.",
      );
    if (memberships)
      console.log(
        "Owner setup is already configured. Sign in or use password recovery.",
      );
    return;
  }
  if (memberships)
    throw new OwnerSetupError(
      "Owner setup is already complete because this workspace has an existing membership. Sign in or use password recovery; no invitation was created.",
    );
  const { tokenHash } = await import("../lib/accounts");
  const { appURL, sendMail } = await import("../lib/email");
  const token = randomBytes(32).toString("base64url");
  db.transaction(() => {
    if (db.prepare("SELECT user_id FROM organization_memberships").get())
      throw new OwnerSetupError(
        "Owner setup is already complete. Sign in or use password recovery.",
      );
    db.prepare(
      "INSERT INTO owner_claims(id,email,name,token_hash,expires_at,used_at) VALUES(1,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,token_hash=excluded.token_hash,expires_at=excluded.expires_at,used_at=NULL",
    ).run(
      person!.email,
      person!.name,
      tokenHash(token),
      Date.now() + 60 * 60 * 1000,
    );
  }).immediate();
  stage = "email";
  await sendMail(
    person!.email,
    "Claim your Keenventory owner account",
    `Activate the owner account for your existing Keen Scents workspace using this single-use link:\n\n${appURL()}/accept-invitation?owner=1&token=${token}\n\nThis link expires in one hour.`,
  );
  console.log("Owner activation email sent. No inventory data was changed.");
}
main()
  .catch((error) => {
    console.error("Owner setup failed:\n" + ownerSetupFailure(error, stage));
    process.exitCode = 1;
  })
  .finally(() => connection?.close());
