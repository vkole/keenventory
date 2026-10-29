export class OwnerSetupError extends Error {}
export type OwnerSetupStage =
  "configuration" | "database" | "authentication" | "email";
export function ownerConfigurationIssues(
  env: Record<string, string | undefined>,
): string[] {
  const issues: string[] = [];
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    issues.push(
      "Set BETTER_AUTH_SECRET to a random secret of at least 32 characters in this server environment.",
    );
  if (!env.BETTER_AUTH_URL)
    issues.push(
      "Set BETTER_AUTH_URL to the public app origin in this server environment.",
    );
  else {
    try {
      const url = new URL(env.BETTER_AUTH_URL);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        issues.push(
          "BETTER_AUTH_URL must be an HTTP(S) origin without credentials, a path, or query parameters.",
        );
      if (env.NODE_ENV === "production" && url.protocol !== "https:")
        issues.push("Production BETTER_AUTH_URL must use HTTPS.");
    } catch {
      issues.push("BETTER_AUTH_URL is not a valid URL.");
    }
  }
  for (const key of ["SMTP_HOST", "SMTP_FROM"])
    if (!env[key]?.trim())
      issues.push(`Set ${key} in this server environment.`);
  if (env.SMTP_USER && !env.SMTP_PASSWORD)
    issues.push(
      "SMTP_USER is set but SMTP_PASSWORD is missing. Set the SMTP password or app password.",
    );
  if (env.SMTP_PASSWORD && !env.SMTP_USER)
    issues.push(
      "SMTP_PASSWORD is set but SMTP_USER is missing. Set the SMTP username.",
    );
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    issues.push("SMTP_PORT must be a number from 1 to 65535.");
  if (env.SMTP_SECURE && !["true", "false"].includes(env.SMTP_SECURE))
    issues.push("SMTP_SECURE must be true or false.");
  return issues;
}
export function localRenderTarget(env: Record<string, string | undefined>) {
  try {
    return (
      new URL(env.BETTER_AUTH_URL!).hostname.endsWith(".onrender.com") &&
      env.RENDER !== "true"
    );
  } catch {
    return false;
  }
}
export function ownerSetupFailure(
  error: unknown,
  stage: OwnerSetupStage,
): string {
  if (error instanceof OwnerSetupError) return error.message;
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const messages: Record<string, string> = {
    EAUTH:
      "SMTP authentication failed. Check SMTP_USER and SMTP_PASSWORD (or the provider app password) in this server environment.",
    EENVELOPE:
      "The mail provider rejected the sender or recipient. Check that SMTP_FROM is an authorized sender.",
    ETIMEDOUT:
      "The SMTP connection timed out. Check SMTP_HOST, SMTP_PORT, SMTP_SECURE, and provider connectivity.",
    EDNS: "The SMTP host could not be resolved. Check SMTP_HOST.",
    ENOTFOUND: "The SMTP host could not be resolved. Check SMTP_HOST.",
    ECONNREFUSED:
      "The SMTP connection was refused. Check the host, port, and TLS settings.",
    ESOCKET:
      "The SMTP connection or TLS negotiation failed. Check the host, port, and TLS settings.",
    SQLITE_READONLY:
      "The workspace database is read-only. Check the persistent disk permissions and KEENVENTORY_DATA_DIR.",
    SQLITE_CANTOPEN:
      "The workspace database could not be opened. Check KEENVENTORY_DATA_DIR and the persistent disk mount.",
    EACCES:
      "The data directory is not accessible. Check the persistent disk and filesystem permissions.",
    EPERM:
      "The data directory is not accessible. Check the persistent disk and filesystem permissions.",
    ERR_DLOPEN_FAILED:
      "The SQLite native module could not be loaded. Use the supported Node.js 24 runtime and reinstall dependencies.",
  };
  if (messages[code]) return messages[code];
  return {
    configuration:
      "Owner setup configuration is invalid. Run this command with --check.",
    database:
      "Workspace database initialization failed. Check the server logs and persistent storage configuration.",
    authentication:
      "Authentication initialization failed. Check the server authentication/database logs; credentials and tokens are not printed here.",
    email:
      "Invitation delivery was not confirmed. Check the SMTP provider settings and server mail logs.",
  }[stage];
}
