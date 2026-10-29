import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "../lib/db";
import { authentication } from "../lib/auth";
import { tokenHash } from "../lib/accounts";
import { appURL, sendMail } from "../lib/email";
async function main() {
  const [email, name] = process.argv.slice(2);
  const p = z
    .object({ email: z.email(), name: z.string().trim().min(1) })
    .parse({ email, name });
  await authentication();
  if (db.prepare("SELECT user_id FROM organization_memberships").get())
    throw Error("Owner setup is already complete. Use User Management.");
  const token = randomBytes(32).toString("base64url");
  db.transaction(() => {
    if (db.prepare("SELECT user_id FROM organization_memberships").get())
      throw Error("Owner setup is already complete.");
    db.prepare(
      "INSERT INTO owner_claims(id,email,name,token_hash,expires_at,used_at) VALUES(1,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,token_hash=excluded.token_hash,expires_at=excluded.expires_at,used_at=NULL",
    ).run(
      p.email.toLowerCase(),
      p.name,
      tokenHash(token),
      Date.now() + 60 * 60 * 1000,
    );
  }).immediate();
  await sendMail(
    p.email,
    "Claim your Keenventory owner account",
    `Activate the owner account for your existing Keen Scents workspace using this single-use link:\n\n${appURL()}/accept-invitation?owner=1&token=${token}\n\nThis link expires in one hour.`,
  );
  console.log("Owner activation email sent. No inventory data was changed.");
}
main()
  .catch(() => {
    console.error(
      "Owner setup failed. Verify configuration and that an owner has not already been configured.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.close());
