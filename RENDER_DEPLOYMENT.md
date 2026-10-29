# Invitation setup on Render

The app supports `/login`, `/accept-invitation`, `/forgot-password`,
`/reset-password`, `/dashboard`, and `/settings/users` as native Next.js routes.
Deploy it as a **Node web service**, with `npm ci && npm run build` as the build
command and `npm start -- --hostname 0.0.0.0 --port $PORT` as the start command.
A static-site SPA fallback is not needed. See Render's
[Next.js deployment guide](https://render.com/docs/deploy-nextjs-app).

The package declares Node.js 24.x, matching the tested runtime. If the service
already sets `NODE_VERSION`, set it to a supported 24.x release as well.

Set these in the existing Render service's environment settings:

```
BETTER_AUTH_URL=https://keenventory.onrender.com
BETTER_AUTH_SECRET=<your existing stable authentication secret>
KEENVENTORY_DATA_DIR=<your existing persistent workspace directory>
SMTP_HOST=<your mail provider's SMTP host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<your SMTP username>
SMTP_PASSWORD=<your SMTP or app password>
SMTP_FROM=<your verified sender address>
```

Use your mail provider's actual TLS/port settings. Never put credentials in a
public environment variable or commit `.env.local`.

Keep the **existing SQLite database** on a persistent disk. Render's default
filesystem is ephemeral; a redeploy must not replace your workspace database.
Do not change the data directory to an empty mount without first backing up and
moving the existing database safely. Render disks are unavailable during builds;
Keenventory now uses a separate temporary build database and only opens/migrates
the persistent workspace when the server runs. See
[Render persistent disks](https://render.com/docs/disks).

## Issue the first Owner link

After the deployed server has the correct environment and persistent database,
run this **in the Render service shell**, using the administrator's real email:

```
node --import tsx scripts/claim-owner.ts alexus.brockington@keenscents.com "Alexus Brockington"
```

Render supplies the environment directly, so this command does not require a
local `.env.local` file. For local development, continue using
`npm run owner:claim -- email@example.com "Full Name"`.

An invitation created against a local Windows database cannot be accepted by a
Render server using a different database, even if both use the same public URL.
Generate invitations against the same persistent database used by the deployed
app. Owner setup stops once a workspace membership exists; existing owners should
use User Management to invite additional users. No inventory reset is needed.

## Invitation behavior

A valid token is exchanged for a 15-minute, HttpOnly, SameSite=Strict setup cookie.
The original token and optional `owner` hint are removed from the address bar.
Refreshing the page continues setup using that cookie; after 15 minutes, reopen
the original invitation email. Tokens remain hashed in the database and are
rechecked on activation. The URL's owner flag never determines permissions.

Invited email, workspace, and role come from the database. New users choose their
name and a password of 12–128 characters. Existing users sign in with their current
account, including MFA if enabled, before acceptance. Existing identities and
memberships are preserved. Activation is transactional and invitations are single
use. Authenticated users continue to `/dashboard`; a session-creation failure
offers sign-in for the successfully created account.

Expired/revoked/used links show a replacement-request form. Requests are recorded
for administrators in `/settings/users` and emailed when SMTP is available.
Requesting a replacement does not reactivate revoked access or generate a public
Owner claim. Initial Owner links must be regenerated from the server shell.

Common password patterns are rejected locally. Optionally set
`KEENVENTORY_CHECK_BREACHED_PASSWORDS=true` to enable Pwned Passwords checks. Only
the first five characters of the SHA-1 hash are sent to the range API; no password
or full hash leaves the server. When enabled, an unavailable safety check asks the
user to retry without consuming the invitation. See the
[Pwned Passwords API](https://haveibeenpwned.com/API/v3#PwnedPasswords).

Invitation/reset URLs are excluded from Next.js development request logging and
pages use a no-referrer policy. Configure any Render/proxy access logging to
redact query strings on invitation, verification, and reset routes as well.

## Validation

`npm test` includes invitation metadata, cookie grants, expiry/revocation/reuse,
concurrent activation, password checks, Owner hint forgery, existing identities,
authenticated redirects, and preservation of inventory records. Run
`node --import tsx scripts/check-invitation-ui.mjs` for desktop/mobile browser checks
using an isolated temporary database. It uses installed Microsoft Edge and listens
on port 3101; no production accounts or email services are used.
