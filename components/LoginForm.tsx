"use client";
import Image from "next/image";
import { useState } from "react";
import { inputClass, buttonClass } from "./ProductForm";
export function LoginForm({
  logo,
  initialForgot = false,
}: {
  logo: string | null;
  initialForgot?: boolean;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [remember, setRemember] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [forgot, setForgot] = useState(initialForgot),
    [twoFactor, setTwoFactor] = useState(false),
    [code, setCode] = useState(""),
    [backup, setBackup] = useState(false);
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const endpoint = twoFactor
        ? backup
          ? "two-factor/verify-backup-code"
          : "two-factor/verify-totp"
        : forgot
          ? "request-password-reset"
          : "sign-in/email";
      const body = twoFactor
        ? { code }
        : forgot
          ? { email, redirectTo: "/reset-password" }
          : { email, password, rememberMe: remember };
      const response = await fetch("/api/auth/" + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (forgot) {
        setMessage(
          "If the account is eligible, a reset email will arrive shortly.",
        );
        return;
      }
      if (!response.ok)
        throw Error(
          "Unable to sign in. Check your credentials or try again later.",
        );
      if (data.twoFactorRedirect) {
        setTwoFactor(true);
        setPassword("");
        return;
      }
      const target =
        new URLSearchParams(window.location.search).get("next") ?? "/";
      window.location.assign(
        target.startsWith("/") &&
          !target.startsWith("//") &&
          !target.includes("\\")
          ? target
          : "/",
      );
    } catch {
      setMessage(
        "Unable to sign in. Check your credentials or try again later.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4EAE8] px-4 py-10 text-[#000E2D]">
      <section className="w-full max-w-md rounded-[2rem] border border-white bg-white p-7 shadow-[0_20px_70px_#000e2d12] sm:p-10">
        <div className="mb-8 text-center">
          {logo && (
            <div className="relative mx-auto mb-6 h-32 w-full overflow-hidden">
              <Image
                width={3000}
                height={3000}
                sizes="(max-width: 640px) 100vw, 384px"
                priority
                src={logo}
                alt="Keen Scents Handmade"
                className="absolute left-0 top-1/2 h-auto w-full max-w-none -translate-y-[54%]"
              />
            </div>
          )}
          <p className="mb-3 text-xs uppercase tracking-[.3em] text-[#868F9E]">
            Keen Scents workspace
          </p>
          <h1 className="font-serif text-4xl">Keenventory</h1>
          <p className="mt-3 text-sm leading-6 text-[#868F9E]">
            Your inventory. Your business. All in one place.
          </p>
        </div>
        <h2 className="mb-5 text-xl font-medium">
          {twoFactor
            ? "Verify your identity"
            : forgot
              ? "Reset your password"
              : "Welcome back"}
        </h2>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {!twoFactor && (
            <label className="grid gap-2 text-sm">
              Email Address
              <input
                required
                type="email"
                autoComplete="username"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {!forgot && !twoFactor && (
            <label className="grid gap-2 text-sm">
              Password
              <div className="relative">
                <input
                  required
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  aria-label="Password"
                  className={inputClass + " pr-16"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-3 text-sm"
                  onClick={() => setShow(!show)}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </label>
          )}
          {twoFactor && (
            <>
              <label className="grid gap-2">
                {backup ? "Backup code" : "Authenticator code"}
                <input
                  required
                  className={inputClass}
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="text-left text-sm underline"
                onClick={() => {
                  setBackup(!backup);
                  setCode("");
                }}
              >
                Use {backup ? "authenticator" : "backup"} code
              </button>
            </>
          )}
          {!forgot && !twoFactor && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember Me
              </label>
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setForgot(true);
                  setMessage("");
                }}
              >
                Forgot Password?
              </button>
            </div>
          )}
          {message && (
            <p role="alert" className="rounded-xl bg-[#F4EAE8] p-3 text-sm">
              {message}
            </p>
          )}
          <button disabled={busy} className={buttonClass + " py-3.5"}>
            {busy
              ? "Please wait…"
              : twoFactor
                ? "Verify"
                : forgot
                  ? "Send Reset Link"
                  : "Sign In"}
          </button>
          {forgot && (
            <button
              type="button"
              className="text-sm underline"
              onClick={() => {
                setForgot(false);
                setMessage("");
              }}
            >
              Back to Sign In
            </button>
          )}
        </form>
        <p className="mt-8 text-center text-xs text-[#868F9E]">
          Private access for the Keen Scents team.
        </p>
      </section>
    </main>
  );
}
