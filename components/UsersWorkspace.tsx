"use client";
import { useEffect, useMemo, useState } from "react";
import {
  actions,
  can,
  defaults,
  features,
  featureLabels,
  roles,
  type Permissions,
  type Role,
  type Viewer,
} from "@/lib/permissions";
import { inputClass, buttonClass, jsonRequest } from "./ProductForm";
type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: string;
  status: string;
  last_login: string | null;
};
export function PermissionsEditor({
  value,
  onChange,
  role,
  disabled = false,
}: {
  value: Permissions;
  onChange: (p: Permissions) => void;
  role: Role;
  disabled?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className="p-2">View Access</th>
            {actions.map((a) => (
              <th className="p-2 capitalize" key={a}>
                {a === "delete" ? "Delete / Archive" : a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(features).map(([f, list]) => (
            <tr key={f} className="border-t">
              <th className="p-2 font-normal">{featureLabels[f]}</th>
              {actions.map((a) => (
                <td className="p-2" key={a}>
                  {list.includes(a) && (
                    <input
                      aria-label={`${featureLabels[f]} ${a}`}
                      type="checkbox"
                      checked={!!value[f]?.includes(a)}
                      disabled={
                        disabled ||
                        role === "Owner" ||
                        (role === "View Only" && a !== "view")
                      }
                      onChange={(e) =>
                        onChange({
                          ...value,
                          [f]: e.target.checked
                            ? [...(value[f] ?? []), a]
                            : (value[f] ?? []).filter((x) => x !== a),
                        })
                      }
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function UsersWorkspace({
  actor,
  create = false,
}: {
  actor: Viewer;
  create?: boolean;
}) {
  const [users, setUsers] = useState<Member[]>([]),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [roleFilter, setRoleFilter] = useState(""),
    [sort, setSort] = useState("name"),
    [descending, setDescending] = useState(false),
    [page, setPage] = useState(1),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null),
    [readOnly, setReadOnly] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState<Role>("Staff"),
    [permissions, setPermissions] = useState<Permissions>(defaults("Staff"));
  const [requests, setRequests] = useState<
    { email: string; created_at: string }[]
  >([]);
  async function load() {
    const d = await jsonRequest("/api/accounts/users");
    setUsers(d.users);
    setRequests(d.requests ?? []);
  }
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  const filtered = useMemo(
    () =>
      users
        .filter(
          (u) =>
            (!status || u.status === status) &&
            (!roleFilter || u.role === roleFilter) &&
            `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()),
        )
        .sort(
          (a, b) =>
            String(a[sort as keyof Member] ?? "").localeCompare(
              String(b[sort as keyof Member] ?? ""),
            ) * (descending ? -1 : 1),
        ),
    [users, status, roleFilter, search, sort, descending],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 25)),
    current = Math.min(page, pages);
  function open(u: Member, view = false) {
    setEditing(u);
    setReadOnly(view);
    setName(u.name);
    setEmail(u.email);
    setRole(u.role);
    setPermissions(JSON.parse(u.permissions));
    setMessage("");
  }
  async function change(u: Member, action: string) {
    if (
      !window.confirm(
        `${action === "revoke" ? "Revoke access for" : action === "disable" ? "Disable" : action === "reactivate" ? "Reactivate" : "Resend invitation to"} ${u.email}?`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await jsonRequest("/api/accounts/users", { id: u.id, action }, "PATCH");
      await load();
      setMessage("User updated.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await jsonRequest(
        "/api/accounts/users",
        editing
          ? { id: editing.id, action: "edit", name, role, permissions }
          : { name, email, role, permissions },
        editing ? "PATCH" : "POST",
      );
      if (create) {
        window.location.assign("/settings/users");
        return;
      }
      setEditing(null);
      await load();
      setMessage("User saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  const form = (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2">
          Name
          <input
            required
            maxLength={150}
            disabled={readOnly}
            value={name}
            className={inputClass}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="grid gap-2">
          Email Address
          <input
            required
            type="email"
            disabled={!!editing || readOnly}
            value={email}
            className={inputClass}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="grid gap-2">
          Access Role
          <select
            disabled={readOnly}
            className={inputClass}
            value={role}
            onChange={(e) => {
              const r = e.target.value as Role;
              setRole(r);
              setPermissions(defaults(r));
            }}
          >
            {roles
              .filter(
                (r) =>
                  actor.role === "Owner" || !["Owner", "Admin"].includes(r),
              )
              .map((r) => (
                <option key={r}>{r}</option>
              ))}
          </select>
        </label>
      </div>
      <PermissionsEditor
        role={role}
        value={permissions}
        onChange={setPermissions}
        disabled={readOnly}
      />
      <div className="flex gap-3">
        {!readOnly && (
          <button disabled={busy} className={buttonClass}>
            {busy ? "Saving…" : editing ? "Save Changes" : "Invite This User"}
          </button>
        )}
        <a
          className="rounded-xl border px-4 py-2"
          href="/settings/users"
          onClick={(e) => {
            if (!create) {
              e.preventDefault();
              setEditing(null);
            }
          }}
        >
          {readOnly ? "Close" : "Cancel"}
        </a>
      </div>
    </form>
  );
  return (
    <section className="space-y-6 rounded-3xl bg-white p-5 sm:p-8">
      <p className="text-sm text-[#868F9E]">
        Account Settings &gt; Users{create ? " > New User" : ""}
      </p>
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">
          {create ? "New User" : "Users"}
        </h1>
        {!create && can(actor, "users", "create") && (
          <a className={buttonClass} href="/settings/users/new">
            + Add User
          </a>
        )}
      </header>
      {!create && requests.length > 0 && (
        <section className="space-y-3 rounded-xl bg-[#F4EAE8] p-4">
          <h2 className="font-semibold">Invitation Requests</h2>
          <p className="text-xs text-[#868F9E]">
            Review each request before granting access.
          </p>
          {requests.map((r) => {
            const pending = users.find(
              (u) =>
                u.email.toLowerCase() === r.email.toLowerCase() &&
                ["Pending Invitation", "Delivery Failed"].includes(u.status),
            );
            return (
              <div
                key={r.email}
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <span>
                  {r.email} · {r.created_at}
                </span>
                {pending && can(actor, "users", "create") ? (
                  <button
                    disabled={busy}
                    className="underline"
                    onClick={() => change(pending, "resend")}
                  >
                    Resend Invitation
                  </button>
                ) : (
                  can(actor, "users", "create") && (
                    <a className="underline" href="/settings/users/new">
                      Review & Add User
                    </a>
                  )
                )}
              </div>
            );
          })}
        </section>
      )}
      {message && (
        <p role="alert" className="rounded-xl bg-[#F4EAE8] p-3">
          {message}
        </p>
      )}
      {create ? (
        form
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <input
              aria-label="Search users"
              className={inputClass}
              value={search}
              placeholder="Search name or email"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <select
              aria-label="Filter status"
              className={inputClass}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {[
                "Active",
                "Pending Invitation",
                "Disabled",
                "Delivery Failed",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Filter role"
              className={inputClass}
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              {roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <select
              aria-label="Sort users"
              className={inputClass}
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {["name", "email", "role", "status", "last_login"].map((s) => (
                <option value={s} key={s}>
                  Sort: {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <button
            className="text-sm underline"
            onClick={() => setDescending(!descending)}
          >
            {descending ? "Descending" : "Ascending"}
          </button>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Name",
                    "Email",
                    "Role",
                    "View Access",
                    "Status",
                    "Last Login",
                    "Actions",
                  ].map((c) => (
                    <th className="p-3" key={c}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice((current - 1) * 25, current * 25).map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="p-3">{u.name}</td>
                    <td className="p-3">{u.email}</td>
                    <td className="p-3">{u.role}</td>
                    <td className="max-w-60 p-3 text-xs">
                      {u.role === "Owner"
                        ? "Full access"
                        : Object.entries(
                            JSON.parse(u.permissions) as Permissions,
                          )
                            .filter(([, a]) => a.includes("view"))
                            .map(([f]) => featureLabels[f])
                            .join(", ") || "No views assigned"}
                    </td>
                    <td className="p-3">{u.status}</td>
                    <td className="p-3">{u.last_login ?? "—"}</td>
                    <td className="p-3">
                      <details>
                        <summary
                          aria-label={`Actions for ${u.name}`}
                          className="cursor-pointer"
                        >
                          ···
                        </summary>
                        <div className="grid min-w-44 gap-2 py-3">
                          {u.status === "Pending Invitation" ||
                          u.status === "Delivery Failed" ? (
                            <>
                              <button
                                disabled={busy}
                                className="text-left"
                                onClick={() => change(u, "resend")}
                              >
                                Resend Invitation
                              </button>
                              <button
                                disabled={busy}
                                className="text-left text-red-700"
                                onClick={() => change(u, "revoke")}
                              >
                                Revoke Access
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="text-left"
                                onClick={() => open(u, true)}
                              >
                                View User
                              </button>
                              {can(actor, "users", "edit") && (
                                <>
                                  {[
                                    "Edit User",
                                    "Change Role",
                                    "Manage Permissions",
                                  ].map((a) => (
                                    <button
                                      key={a}
                                      className="text-left"
                                      onClick={() => open(u)}
                                    >
                                      {a}
                                    </button>
                                  ))}
                                  <button
                                    disabled={busy}
                                    className="text-left text-red-700"
                                    onClick={() =>
                                      change(
                                        u,
                                        u.status === "Disabled"
                                          ? "reactivate"
                                          : "disable",
                                      )
                                    }
                                  >
                                    {u.status === "Disabled"
                                      ? "Reactivate User"
                                      : "Disable User"}
                                  </button>
                                  <button
                                    disabled={busy}
                                    className="text-left text-red-700"
                                    onClick={() => change(u, "revoke")}
                                  >
                                    Revoke Access
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <p className="p-4">No users match these filters.</p>
            )}
          </div>
          <div className="flex gap-4">
            <button
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>
            <span>
              Page {current} of {pages}
            </span>
            <button
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={readOnly ? "View User" : "Edit User"}
          className="fixed inset-0 z-50 overflow-auto bg-[#000E2D]/40 p-4 sm:p-10"
        >
          <section className="mx-auto max-w-5xl space-y-5 rounded-3xl bg-white p-6">
            <h2 className="text-2xl">{readOnly ? "View User" : "Edit User"}</h2>
            {form}
            {message && <p role="alert">{message}</p>}
          </section>
        </div>
      )}
    </section>
  );
}
