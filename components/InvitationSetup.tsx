"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  LoaderCircle,
  CheckCircle2,
} from "lucide-react";
type Invitation = {
  name: string;
  email: string;
  workspace: string;
  role: string;
  existingUser: boolean;
  authenticated: boolean;
  emailVerified: boolean;
};
const input =
  "w-full rounded-lg border border-[#E2E1E2] bg-white px-3 py-3 text-sm text-[#000E2D] outline-none focus:border-[#868F9E] focus:ring-2 focus:ring-[#E8C9C9]/50 read-only:bg-[#F8F7F7]";
const button =
  "w-full rounded-lg bg-[#000E2D] px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-50";
async function request(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        },
  );
  const data = await response.json();
  if (!response.ok) {
    const error = Error(
      data.error?.message ??
        data.error ??
        "This request could not be completed.",
    );
    Object.assign(error, { status: response.status });
    throw error;
  }
  return data;
}
export function InvitationSetup() {
  const router = useRouter();
  const [invitation, setInvitation] = useState<Invitation | null>(null),
    [loading, setLoading] = useState(true),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [show, setShow] = useState(false),
    [showConfirm, setShowConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [invalid, setInvalid] = useState(""),
    [requestEmail, setRequestEmail] = useState(""),
    [requested, setRequested] = useState(false),
    [mfa, setMfa] = useState(false),
    [code, setCode] = useState(""),
    [backup, setBackup] = useState(false),
    [success, setSuccess] = useState(false),
    [destination, setDestination] = useState("/login");
  const validation = useRef<Promise<Invitation> | null>(null);
  useEffect(() => {
    if (!validation.current)
      validation.current = (async () => {
        const url = new URL(window.location.href),
          token = url.searchParams.get("token");
        try {
          return await request(
            "/api/accounts/invitation",
            token ? { token } : undefined,
          );
        } finally {
          url.searchParams.delete("token");
          url.searchParams.delete("owner");
          router.replace(url.pathname + url.search + url.hash, {
            scroll: false,
          });
        }
      })();
    let active = true;
    validation.current
      .then((info) => {
        if (active) {
          setInvitation(info);
          setName(info.name);
          setRequestEmail(info.email);
        }
      })
      .catch((e) => {
        if (active) setInvalid(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(
      () => window.location.assign(destination),
      1800,
    );
    return () => window.clearTimeout(timer);
  }, [success, destination]);
  async function submit() {
    if (!invitation || busy) return;
    if (!name.trim()) {
      setMessage("Enter your full name.");
      return;
    }
    if (
      !invitation.existingUser &&
      (password.length < 12 || password.length > 128 || password !== confirm)
    ) {
      setMessage(
        password !== confirm
          ? "Passwords must match."
          : "Use a password of 12–128 characters.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (invitation.existingUser && !invitation.authenticated) {
        if (mfa)
          await request(
            "/api/auth/two-factor/" +
              (backup ? "verify-backup-code" : "verify-totp"),
            { code },
          );
        else {
          const login = await request("/api/auth/sign-in/email", {
            email: invitation.email,
            password,
            rememberMe: false,
            callbackURL: "/accept-invitation",
          });
          if (login.twoFactorRedirect) {
            setMfa(true);
            setPassword("");
            return;
          }
        }
        const refreshed: Invitation = await request("/api/accounts/invitation");
        setInvitation(refreshed);
        if (!refreshed.authenticated)
          throw Error("Sign in to the invited email address to continue.");
      }
      const result = await request("/api/accounts/activate", {
        name: name.trim(),
        ...(!invitation.existingUser
          ? { password, confirmPassword: confirm }
          : {}),
      });
      const session = result.authenticated
        ? await request("/api/auth/get-session").catch(() => null)
        : null;
      setDestination(session?.user ? "/dashboard" : "/login");
      setSuccess(true);
      setPassword("");
      setConfirm("");
      setCode("");
      setMessage("Your Keenventory account has been successfully created.");
    } catch (e) {
      const errorMessage =
        e instanceof Error
          ? e.message
          : "Account activation failed. Please try again.";
      if (e instanceof Error && "status" in e && e.status === 409) {
        setInvitation({ ...invitation, authenticated: false });
        setMfa(false);
        setPassword("");
      }
      if (
        /invitation is invalid|setup session is missing|Open the complete invitation/.test(
          errorMessage,
        )
      ) {
        setInvalid(errorMessage);
        setInvitation(null);
      } else setMessage(errorMessage);
    } finally {
      setBusy(false);
    }
  }
  async function requestNew() {
    setBusy(true);
    setMessage("");
    try {
      const result = await request("/api/accounts/invitation/request", {
        email: requestEmail,
      });
      setRequested(true);
      setMessage(result.message);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to submit your request.",
      );
    } finally {
      setBusy(false);
    }
  }
  const passwordField = (confirming = false) => (
    <label
      className="grid gap-1.5 text-sm font-medium"
      htmlFor={confirming ? "confirm-password" : "setup-password"}
    >
      {confirming
        ? "Confirm Password"
        : invitation?.existingUser
          ? "Password"
          : "Create Password"}
      <div className="relative">
        <input
          id={confirming ? "confirm-password" : "setup-password"}
          required
          minLength={invitation?.existingUser ? undefined : 12}
          maxLength={128}
          autoComplete={
            invitation?.existingUser ? "current-password" : "new-password"
          }
          type={(confirming ? showConfirm : show) ? "text" : "password"}
          className={input + " pr-12"}
          placeholder={
            confirming
              ? "Confirm your password"
              : invitation?.existingUser
                ? "Enter your current password"
                : "Create a secure password"
          }
          value={confirming ? confirm : password}
          onChange={(e) =>
            confirming
              ? setConfirm(e.target.value)
              : setPassword(e.target.value)
          }
        />
        <button
          type="button"
          aria-label={`${(confirming ? showConfirm : show) ? "Hide" : "Show"} ${confirming ? "confirm password" : "password"}`}
          aria-pressed={confirming ? showConfirm : show}
          className="absolute right-3 top-3 text-[#868F9E]"
          onClick={() =>
            confirming ? setShowConfirm(!showConfirm) : setShow(!show)
          }
        >
          {(confirming ? showConfirm : show) ? (
            <EyeOff size={18} />
          ) : (
            <Eye size={18} />
          )}
        </button>
      </div>
    </label>
  );
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4EAE8] px-4 py-7 text-[#000E2D]">
      <section className="w-full max-w-[720px] rounded-2xl border-[10px] border-[#F4EAE8] bg-white px-4 py-5 shadow-[0_16px_60px_#000e2d15] sm:px-7 sm:py-6">
        <header className="border-b border-[#E8C9C9] pb-5 text-center">
          <div className="relative mx-auto mb-3 h-24 w-60 overflow-hidden">
            <Image
              src="/keen-scents-logo-a.png"
              alt="Keen Scents Handmade"
              width={3000}
              height={3000}
              priority
              unoptimized
              className="absolute left-0 top-1/2 w-full max-w-none -translate-y-[54%]"
            />
          </div>
          <p className="text-xl font-semibold">Keenventory</p>
          <p className="mt-1 text-xs text-[#868F9E]">Powered by Keen Scents</p>
          <h1 className="mt-2 text-lg font-semibold">
            {invalid
              ? "Invitation Unavailable"
              : success
                ? "Account Ready"
                : "Set Up Your Account"}
          </h1>
          <p className="mt-2 text-sm text-[#868F9E]">
            You&apos;ve been invited to Keenventory. Complete your account setup
            to get started.
          </p>
        </header>
        {loading ? (
          <div
            role="status"
            className="flex items-center justify-center gap-3 py-12 text-sm text-[#868F9E]"
          >
            <LoaderCircle className="animate-spin" size={18} />
            Verifying your invitation…
          </div>
        ) : success ? (
          <div className="grid justify-items-center gap-4 py-8 text-center">
            <CheckCircle2 size={32} className="text-[#868F9E]" />
            <p role="status">
              Your Keenventory account has been successfully created.
            </p>
            <p className="text-sm text-[#868F9E]">
              {destination === "/dashboard"
                ? "Opening your workspace…"
                : "Sign in to open your workspace."}
            </p>
            <a className={button} href={destination}>
              {destination === "/dashboard"
                ? "Continue to Dashboard"
                : "Continue to Sign In"}
            </a>
          </div>
        ) : invalid ? (
          <div className="grid gap-5 py-6">
            <p role="alert" className="rounded-lg bg-[#F4EAE8] p-3 text-sm">
              {invalid}
            </p>
            <p className="text-sm text-[#868F9E]">
              Open the latest invitation email, or ask your workspace
              administrator for a replacement link.
            </p>
            {!requested && (
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  requestNew();
                }}
              >
                <label className="grid gap-2 text-sm" htmlFor="request-email">
                  Email Address
                  <input
                    id="request-email"
                    required
                    type="email"
                    autoComplete="email"
                    className={input}
                    placeholder="Your invited email address"
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                  />
                </label>
                <button disabled={busy} className={button}>
                  {busy ? "Sending Request…" : "Request a New Invitation"}
                </button>
              </form>
            )}
            {message && (
              <p role="status" className="text-sm">
                {message}
              </p>
            )}
          </div>
        ) : (
          invitation && (
            <form
              className="grid gap-4 pt-5"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="font-semibold">
                  Workspace: {invitation.workspace}
                </p>
                <span
                  aria-label="Invitation role"
                  className="rounded-full bg-[#F3F2F2] px-2.5 py-1 text-xs"
                >
                  {invitation.role} Invitation
                </span>
              </div>
              <label
                htmlFor="full-name"
                className="grid gap-1.5 text-sm font-medium"
              >
                Full Name
                <input
                  id="full-name"
                  required
                  maxLength={150}
                  autoComplete="name"
                  className={input}
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label
                htmlFor="invited-email"
                className="grid gap-1.5 text-sm font-medium"
              >
                Email Address
                <input
                  id="invited-email"
                  type="email"
                  readOnly
                  autoComplete="username"
                  className={input}
                  value={invitation.email}
                />
              </label>
              {invitation.existingUser && (
                <p className="rounded-lg bg-[#F4EAE8] p-3 text-sm">
                  {invitation.authenticated
                    ? "You are signed in to the invited account. Accept the invitation to continue."
                    : "An account already exists for this email. Sign in to accept your invitation."}
                </p>
              )}
              {mfa ? (
                <>
                  <label htmlFor="mfa-code" className="grid gap-2 text-sm">
                    {backup ? "Backup Code" : "Authenticator Code"}
                    <input
                      id="mfa-code"
                      required
                      autoComplete="one-time-code"
                      className={input}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="text-left text-xs underline"
                    onClick={() => {
                      setBackup(!backup);
                      setCode("");
                    }}
                  >
                    Use {backup ? "authenticator" : "backup"} code
                  </button>
                </>
              ) : (
                (!invitation.existingUser || !invitation.authenticated) &&
                passwordField()
              )}
              {!invitation.existingUser && passwordField(true)}
              {!invitation.existingUser && (
                <p className="flex items-center gap-2 text-xs text-[#868F9E]">
                  <ShieldCheck size={15} />
                  Use at least 12 characters. Your password will be securely
                  protected.
                </p>
              )}
              {invitation.existingUser && !invitation.authenticated && !mfa && (
                <div className="flex flex-wrap gap-4 text-xs">
                  <a className="underline" href="/forgot-password">
                    Forgot Password?
                  </a>
                  {!invitation.emailVerified && (
                    <button
                      type="button"
                      disabled={busy}
                      className="underline"
                      onClick={async () => {
                        try {
                          await request("/api/auth/send-verification-email", {
                            email: invitation.email,
                            callbackURL: "/accept-invitation",
                          });
                          setMessage(
                            "If eligible, a verification email will arrive shortly.",
                          );
                        } catch {
                          setMessage(
                            "Unable to send verification. Try again later.",
                          );
                        }
                      }}
                    >
                      Send Verification Email
                    </button>
                  )}
                </div>
              )}
              {message && (
                <p role="alert" className="rounded-lg bg-[#F4EAE8] p-3 text-sm">
                  {message}
                </p>
              )}
              <button disabled={busy} className={button}>
                {busy
                  ? "Activating Your Account…"
                  : mfa
                    ? "Verify & Accept Invitation"
                    : "Activate My Account"}
              </button>
            </form>
          )
        )}
        <p className="mt-4 text-center text-xs text-[#868F9E]">
          Already have an account?{" "}
          <a className="underline" href="/login">
            Back to Sign In
          </a>
        </p>
      </section>
    </main>
  );
}
