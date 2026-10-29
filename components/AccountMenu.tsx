"use client";
import { can, type Viewer } from "@/lib/permissions";
export function AccountMenu({ user }: { user: Viewer }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer rounded-xl bg-[#F4EAE8] px-4 py-2 text-sm">
        {user.name} · {user.role}
      </summary>
      <div className="absolute right-0 z-50 grid w-56 gap-2 rounded-2xl border bg-white p-4 shadow-xl">
        <a href="/settings/profile">My Profile</a>
        <a href="/settings/profile#security">Security Settings</a>
        {can(user, "account") && (
          <a href="/settings/profile">Account Settings</a>
        )}
        {can(user, "users") && ["Owner", "Admin"].includes(user.role) && (
          <a href="/settings/users">User Management</a>
        )}
        <button
          className="text-left text-red-700"
          onClick={async () => {
            const response = await fetch("/api/auth/sign-out", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (response.ok) window.location.assign("/login");
          }}
        >
          Sign Out
        </button>
      </div>
    </details>
  );
}
