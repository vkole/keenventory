import { betterAuth, type BetterAuthOptions } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { getMigrations } from "better-auth/db/migration";
import { db } from "./db";
import { appURL, sendMail } from "./email";
let instance: ReturnType<typeof createAuth> | undefined;
function authOptions() {
  if (
    !process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET.length < 32
  )
    throw Error(
      "Configure a random BETTER_AUTH_SECRET of at least 32 characters.",
    );
  return {
    appName: "Keenventory",
    baseURL: appURL(),
    secret: process.env.BETTER_AUTH_SECRET,
    database: db,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendMail(
          user.email,
          "Reset your Keenventory password",
          `Reset your password using this single-use link (expires in one hour):\n\n${url}\n\nIf you did not request this, ignore this email.`,
        );
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail(
          user.email,
          "Verify your Keenventory email",
          `Verify your email address:\n\n${url}`,
        );
      },
      sendOnSignIn: true,
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await sendMail(
            user.email,
            "Confirm your Keenventory email change",
            `A change to ${newEmail} was requested. Confirm it:\n\n${url}`,
          );
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 10,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 300, max: 3 },
      },
    },
    advanced: { useSecureCookies: appURL().startsWith("https://") },
    plugins: [twoFactor({ issuer: "Keenventory" })],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const m = db
              .prepare(
                "SELECT user_id,status FROM organization_memberships WHERE user_id=? AND organization_id=1",
              )
              .get(session.userId) as
              { user_id: string; status: string } | undefined;
            if (m && m.status !== "Active") return false;
            if (!m) {
              const identity = db
                .prepare("SELECT email FROM user WHERE id=?")
                .get(session.userId) as { email: string } | undefined;
              if (!identity) return false;
              const pending = db
                .prepare(
                  "SELECT id FROM invitations WHERE lower(email)=lower(?) AND organization_id=1 AND status='Pending Invitation' AND expires_at>?",
                )
                .get(identity.email, Date.now());
              const claim =
                !db
                  .prepare("SELECT user_id FROM organization_memberships")
                  .get() &&
                db
                  .prepare(
                    "SELECT id FROM owner_claims WHERE lower(email)=lower(?) AND used_at IS NULL AND expires_at>?",
                  )
                  .get(identity.email, Date.now());
              if (!pending && !claim) return false;
              // A provider session alone grants no business access: every
              // application guard still requires an active workspace membership.
              return { data: session };
            }
            db.prepare(
              "UPDATE organization_memberships SET last_login=CURRENT_TIMESTAMP WHERE user_id=?",
            ).run(session.userId);
            return { data: session };
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}
function createAuth(options: ReturnType<typeof authOptions>) {
  return betterAuth(options);
}
let initializing: Promise<ReturnType<typeof createAuth>> | undefined;
export async function authentication() {
  if (instance) return instance;
  if (!initializing)
    initializing = (async () => {
      const options = authOptions();
      const migration = await getMigrations(options);
      await migration.runMigrations();
      instance = createAuth(options);
      return instance;
    })().catch((e) => {
      initializing = undefined;
      throw e;
    });
  return initializing;
}
