"use client";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import type { Viewer } from "@/lib/permissions";
import { inputClass, buttonClass, jsonRequest } from "./ProductForm";
type Session = {
  token: string;
  userAgent?: string;
  createdAt: string;
  expiresAt: string;
};
async function authAction(path: string, body?: unknown) {
  return jsonRequest("/api/auth/" + path, body);
}
export function AccountSettingsWorkspace({ user }: { user: Viewer }) {
  const [name, setName] = useState(user.name),
    [notifications, setNotifications] = useState(true),
    [email, setEmail] = useState(user.email),
    [password, setPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [code, setCode] = useState(""),
    [uri, setUri] = useState(""),
    [qr, setQr] = useState(""),
    [backups, setBackups] = useState<string[]>([]),
    [enabled, setEnabled] = useState(false),
    [sessions, setSessions] = useState<Session[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [image, setImage] = useState(user.image),
    [storage, setStorage] = useState(false);
  const load = useCallback(async () => {
    const [p, s, me] = await Promise.all([
      jsonRequest("/api/accounts/profile"),
      authAction("list-sessions"),
      authAction("get-session"),
    ]);
    setNotifications(!!p.profile.notifications);
    setSessions(s);
    setEnabled(!!me?.user?.twoFactorEnabled);
    setStorage(!!p.storage);
  }, []);
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);
  async function perform(task: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await task();
      setMessage(success);
      setPassword("");
      setNewPassword("");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  const label = (
    title: string,
    value: string,
    set: (v: string) => void,
    type = "text",
  ) => (
    <label className="grid gap-2 text-sm">
      {title}
      <input
        className={inputClass}
        value={value}
        type={type}
        autoComplete={type === "password" ? "current-password" : undefined}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
  return (
    <section className="space-y-8 rounded-3xl bg-white p-5 sm:p-8">
      <p className="text-sm text-[#868F9E]">Settings &gt; Account Settings</p>
      <h1 className="text-3xl font-semibold">Account Settings</h1>
      {message && (
        <p role="alert" className="rounded-xl bg-[#F4EAE8] p-3">
          {message}
        </p>
      )}
      <form
        className="grid max-w-lg gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          perform(
            () =>
              jsonRequest(
                "/api/accounts/profile",
                { name, notifications },
                "PATCH",
              ),
            "Profile saved.",
          );
        }}
      >
        <h2 className="text-xl">Profile</h2>
        {label("Display Name", name, setName)}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={notifications}
            onChange={(e) => setNotifications(e.target.checked)}
          />
          Receive optional workspace notifications
        </label>
        <button disabled={busy} className={buttonClass}>
          Save Profile
        </button>
      </form>
      <div className="grid max-w-lg gap-3">
        <h2 className="text-xl">Profile Image</h2>
        {image && (
          <>
            <img
              src={image}
              alt="Your profile"
              className="h-24 w-24 rounded-full object-cover"
            />
            <button
              disabled={busy}
              className="text-left text-red-700 underline"
              onClick={() => {
                if (window.confirm("Remove your profile image?"))
                  perform(async () => {
                    await jsonRequest(
                      "/api/accounts/avatar",
                      { confirm: true },
                      "DELETE",
                    );
                    setImage(null);
                  }, "Profile image removed.");
              }}
            >
              Remove Image
            </button>
          </>
        )}
        <label className="grid gap-2 text-sm">
          {image ? "Replace Image" : "Upload Image"}
          <input
            disabled={busy || !storage}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                perform(async () => {
                  const body = new FormData();
                  body.set("file", file);
                  const r = await fetch("/api/accounts/avatar", {
                    method: "POST",
                    body,
                  });
                  if (!r.ok) throw Error((await r.json()).error);
                  setImage("/api/accounts/avatar?t=" + Date.now());
                }, "Profile image saved.");
            }}
          />
        </label>
        {!storage && (
          <p className="text-sm text-[#868F9E]">
            Image uploads become available when workspace storage is connected.
          </p>
        )}
      </div>
      <section id="security" className="grid max-w-lg gap-4 border-t pt-6">
        <h2 className="text-xl">Security</h2>
        {label(
          "Current password (required for security changes)",
          password,
          setPassword,
          "password",
        )}
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            perform(
              () =>
                authAction("change-email", {
                  newEmail: email,
                  currentPassword: password,
                  callbackURL: "/settings/account",
                }),
              "Check your current email address to confirm the change.",
            );
          }}
        >
          {label("Email Address", email, setEmail, "email")}
          <button
            disabled={busy || !password || email === user.email}
            className={buttonClass}
          >
            Request Email Change
          </button>
        </form>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            perform(
              () =>
                authAction("change-password", {
                  currentPassword: password,
                  newPassword,
                  revokeOtherSessions: true,
                }),
              "Password changed. Other sessions have been revoked.",
            );
          }}
        >
          <label className="grid gap-2">
            New password
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <button disabled={busy || !password} className={buttonClass}>
            Change Password
          </button>
        </form>
        <h3 className="mt-4 font-semibold">Multifactor Authentication</h3>
        <p className="text-sm">
          Authenticator protection is {enabled ? "enabled" : "not enabled"}.
        </p>
        {!enabled ? (
          <button
            disabled={busy || !password}
            className={buttonClass}
            onClick={() =>
              perform(async () => {
                const d = await authAction("two-factor/enable", { password });
                setUri(d.totpURI);
                setQr(await QRCode.toDataURL(d.totpURI));
                setBackups(d.backupCodes);
              }, "Scan the code in your authenticator, save backup codes, then verify to finish setup.")
            }
          >
            Set Up Authenticator
          </button>
        ) : (
          <button
            disabled={busy || !password}
            className="rounded-xl border p-3 text-red-700"
            onClick={() => {
              if (window.confirm("Disable multifactor authentication?"))
                perform(
                  () => authAction("two-factor/disable", { password }),
                  "Authenticator protection disabled.",
                );
            }}
          >
            Disable Authenticator
          </button>
        )}
        {uri && (
          <div className="grid gap-3 rounded-xl bg-[#F4EAE8] p-4">
            {qr && (
              <img
                src={qr}
                alt="Scan with your authenticator app"
                className="h-48 w-48"
              />
            )}
            <details>
              <summary>Manual setup link</summary>
              <code className="break-all text-xs">{uri}</code>
            </details>
            <p className="text-sm">
              Save these backup codes securely. Each can be used once.
            </p>
            <pre className="whitespace-pre-wrap text-sm">
              {backups.join("\n")}
            </pre>
            {label("Authenticator code", code, setCode)}
            <button
              disabled={busy || !code}
              className={buttonClass}
              onClick={() =>
                perform(async () => {
                  await authAction("two-factor/verify-totp", { code });
                  setUri("");
                  setQr("");
                  setBackups([]);
                  setCode("");
                }, "Authenticator protection enabled.")
              }
            >
              Verify and Enable
            </button>
          </div>
        )}
      </section>
      <section className="grid gap-3 border-t pt-6">
        <h2 className="text-xl">Active Sessions</h2>
        {sessions.map((s) => (
          <div
            key={s.token}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
          >
            <div>
              <p className="text-sm">{s.userAgent || "Browser session"}</p>
              <p className="text-xs text-[#868F9E]">
                Expires {new Date(s.expiresAt).toLocaleString()}
              </p>
            </div>
            <button
              disabled={busy}
              className="text-red-700 underline"
              onClick={() => {
                if (window.confirm("Revoke this session?"))
                  perform(
                    () => authAction("revoke-session", { token: s.token }),
                    "Session revoked.",
                  );
              }}
            >
              Revoke
            </button>
          </div>
        ))}
        <button
          disabled={busy}
          className="text-left underline"
          onClick={() =>
            perform(
              () => authAction("revoke-other-sessions", {}),
              "Other sessions revoked.",
            )
          }
        >
          Revoke All Other Sessions
        </button>
      </section>
      <Link className="inline-block underline" href="/">
        Back to Dashboard
      </Link>
    </section>
  );
}
