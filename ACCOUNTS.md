# Accounts and deployment

See [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) for production invitation setup
on Render, including persistent storage and issuing links from the service shell.

Keenventory requires authentication for business pages and every inventory API.
Better Auth manages credential hashing, email verification, expiring database
sessions, password recovery, and optional authenticator MFA. Public registration
is disabled. Existing business records are preserved by additive migrations.

## Configure the server

Use Node.js 24 LTS. Copy `.env.example` to `.env.local`. Set
`BETTER_AUTH_URL` to the app's exact public origin, and `BETTER_AUTH_SECRET` to a
cryptographically random secret of at least 32 characters. Generate one with
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
Keep the secret on the server and stable across restarts.

Set SMTP_HOST, SMTP_PORT, SMTP_FROM, and any SMTP_USER/SMTP_PASSWORD credentials.
Use SMTP_SECURE=true for implicit TLS (usually port 465); port 587 uses STARTTLS.
Account emails fail closed when SMTP is not configured. Tests deliver to a local
SMTP test server; production email deliverability still needs your mail service.

Production requires HTTPS; configure TLS at your reverse proxy. Session cookies
are HttpOnly and secure on HTTPS. Forward only trusted client IP information at
your proxy; otherwise Better Auth uses a conservative shared rate-limit bucket.
Keep the persistent SQLite directory and backups accessible only to the server.

## Claim the existing workspace

After configuring `.env.local`, run from the server:

```
npm run owner:claim -- your-admin-email@example.com "Your Name"
```

This sends a one-hour, single-use activation email to the specified administrator.
It does not print the token or expose public owner registration. The command
stops once any membership exists. Running it again before activation replaces
the old link. Activate from the email and sign in at `/login`.

Owner setup is not run automatically and uses no hardcoded email or password.
Someone with server access must run it. Back up the database before production
deployment. Do not create a fresh database to enable accounts.

## Manage access

Open `/settings/users` to invite employees, edit roles/permissions, resend/revoke
invitations, and disable/reactivate accounts. Invitations expire after 48 hours.
Acceptance verifies possession of the invited mailbox and assigns the server's
stored access configuration. Resends replace old links. Delivery failures appear
in the list and can be retried.

Only Owner/Admin members with user-management permission can manage users. Only
owners manage administrative roles. The last active owner cannot be disabled or
demoted. Access changes revoke sessions immediately. View Only cannot write even
if an override contains a write action. APIs protect exports and Shopify actions.

`/settings/profile` supports names, email changes with password reauthentication
and confirmation, password changes, persistent profile images (S3 required),
notification preferences, authenticator MFA with backup codes, and session
revocation. Preferences persist; invitation/recovery emails are mandatory.
MFA enrollment requires verification of an authenticator code.

Financially restricted users receive a scoped operational workspace. Sensitive
fields are removed from responses, including nested recipe snapshots and history.
Changing financial fields requires the relevant financial permissions. Inventory
exports currently require both pricing and cost export permissions.

## Workspace isolation and audit

This installation uses one workspace per database. Existing business rows are
bound to organization 1, with CHECK constraints rejecting other organizations.
Membership checks require organization 1. Workspace switching and public workspace
creation are unavailable. Do not remove these constraints without first adding
organization-scoped queries throughout the application.

Audit records include workspace, actor, action, record, timestamp, and outcome.
Membership edits include before/after access state. Database triggers prevent
updating/deleting audit records through the app. Infrastructure administrators
with direct database access control the database and backup policy.

Run `npm test` and `npm run build` before deployment. Tests cover authenticated
inventory workflows, invitation acceptance/reuse/expiry, password recovery,
logout, disabled accounts, last-owner protection, read-only access, sensitive
data filtering, unauthorized exports/pushes, workspace binding, and audit records.
