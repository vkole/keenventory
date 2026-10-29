"use client";
import { useState } from "react";
import { buttonClass, inputClass } from "./ProductForm";
export function ActivationForm({ reset = false }: { reset?: boolean }) {
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  async function submit() {
    if (password !== confirm) {
      setMessage("Passwords must match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const params = new URLSearchParams(window.location.search),
        token = params.get("token");
      if (!token) throw Error("This link is invalid.");
      const response = await fetch(
        reset ? "/api/auth/reset-password" : "/api/accounts/activate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            reset
              ? { token, newPassword: password }
              : { token, password, owner: params.get("owner") === "1" },
          ),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw Error(
          data.error?.message ??
            data.error ??
            data.message ??
            "Unable to use this link.",
        );
      if (!reset) {
        window.location.assign("/");
        return;
      }
      setDone(true);
      setPassword("");
      setConfirm("");
      setMessage(
        reset
          ? "Password updated. Sign in with your new password."
          : "Your account is active. Sign in to open Keenventory.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Account setup failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4EAE8] p-5">
      <section className="grid w-full max-w-md gap-5 rounded-3xl bg-white p-8 shadow-xl">
        <h1 className="font-serif text-3xl">
          {reset ? "Reset password" : "Welcome to Keenventory"}
        </h1>
        {!done && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <p className="text-sm text-[#868F9E]">
              Choose a password of 12–128 characters.
            </p>
            <label className="grid gap-2">
              New password
              <input
                required
                minLength={12}
                maxLength={128}
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="grid gap-2">
              Confirm password
              <input
                required
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <button disabled={busy} className={buttonClass}>
              {busy ? "Saving…" : reset ? "Save Password" : "Activate Account"}
            </button>
          </form>
        )}
        {message && <p role="alert">{message}</p>}
        <a className="underline" href="/login">
          Sign In
        </a>
      </section>
    </main>
  );
}
