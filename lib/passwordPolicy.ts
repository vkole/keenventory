import { createHash } from "node:crypto";
const common = new Set([
  "password123456",
  "password123456789",
  "qwerty12345678",
  "123456789012",
  "1234567890123456",
  "letmein123456",
  "welcome123456",
]);
export async function checkNewPassword(password: string) {
  if (password.length < 12 || password.length > 128)
    throw Error("Use a password of 12–128 characters.");
  if (common.has(password.toLowerCase()) || /^(.)\1+$/.test(password))
    throw Error("Choose a less common password.");
  if (process.env.KEENVENTORY_CHECK_BREACHED_PASSWORDS !== "true") return;
  // Only a five-character SHA-1 prefix leaves the server, never the password.
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  const response = await fetch(
    "https://api.pwnedpasswords.com/range/" + hash.slice(0, 5),
    {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    },
  ).catch(() => {
    throw Error("Password safety check is unavailable. Please try again.");
  });
  if (!response.ok)
    throw Error("Password safety check is unavailable. Please try again.");
  const match = (await response.text())
    .split(/\r?\n/)
    .find((line) => line.split(":")[0] === hash.slice(5));
  if (match && Number(match.split(":")[1]) > 0)
    throw Error(
      "This password appears in known breaches. Choose another password.",
    );
}
