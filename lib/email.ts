import nodemailer from "nodemailer";
export function appURL() {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) throw Error("Set BETTER_AUTH_URL before enabling accounts.");
  if (process.env.NODE_ENV === "production" && !url.startsWith("https://"))
    throw Error("Production accounts require HTTPS.");
  return new URL(url).origin;
}
export function mailReady() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}
export async function sendMail(to: string, subject: string, text: string) {
  if (!mailReady())
    throw Error("Configure SMTP_HOST and SMTP_FROM to send account emails.");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  const url = text.match(/https?:\/\/[^\s]+/)?.[0];
  const label = subject.includes("Invited")
    ? "Accept Invitation"
    : subject.includes("Reset")
      ? "Reset Password"
      : subject.includes("owner")
        ? "Activate Owner Account"
        : "Continue to Keenventory";
  const html = `<!doctype html><html><body style="margin:0;background:#f4eae8;font:16px Arial;color:#000e2d;padding:32px"><main style="max-width:560px;margin:auto;background:white;border-radius:20px;padding:32px"><h1>Keenventory</h1><h2 style="font-size:20px">${escape(subject)}</h2>${text
    .split("\n\n")
    .filter((p) => !url || !p.includes(url))
    .map((p) => `<p style="line-height:1.7">${escape(p)}</p>`)
    .join(
      "",
    )}${url ? `<p style="margin:28px 0"><a style="display:inline-block;background:#000e2d;color:white;text-decoration:none;padding:14px 22px;border-radius:10px" href="${escape(url)}">${label}</a></p><p style="font-size:12px;word-break:break-all">Or open: ${escape(url)}</p>` : ""}</main></body></html>`;
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
}
