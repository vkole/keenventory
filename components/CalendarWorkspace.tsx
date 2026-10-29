"use client";
import { useState, useEffect, useCallback } from "react";
import { useModalKeyboard } from "./useModalKeyboard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { can, type Viewer } from "@/lib/permissions";
import { addDate, dateInZone } from "@/lib/calendarDates";
import type { CalendarItem } from "@/lib/calendarStore";
import { buttonClass, inputClass, jsonRequest } from "./ProductForm";
import { AttachmentGallery, uploadAttachments } from "./AttachmentGallery";
const platforms = [
    "Instagram",
    "TikTok",
    "Facebook",
    "Pinterest",
    "YouTube",
    "Website",
    "Email Marketing",
    "Other",
  ],
  types = [
    "Photo",
    "Reel",
    "Video",
    "Story",
    "Carousel",
    "Blog",
    "Email",
    "Promotion",
  ],
  statuses = [
    "Idea",
    "Draft",
    "In Progress",
    "Ready",
    "Scheduled",
    "Published",
    "Cancelled",
  ];
type Draft = {
  copy_from?: number;
  id?: number;
  title: string;
  date: string;
  time: string;
  timezone: string;
  status: string;
  description: string;
  notes: string;
  event_type: string;
  record_type: string | null;
  record_id: number | null;
  platform: string;
  content_type: string;
  hashtags: string;
  campaign: string;
  assigned_user: string | null;
  external_link: string;
  product_ids: number[];
};
export function CalendarWorkspace({
  user,
  content = false,
  scope = "all",
}: {
  user: Viewer;
  content?: boolean;
  scope?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const feature = content ? "content" : "calendar",
    endpoint = "/api/" + (content ? "content" : "calendar");
  const [zone, setZone] = useState(
      () =>
        Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    ),
    [cursor, setCursor] = useState(() =>
      dateInZone(
        new Date(),
        Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
      ),
    ),
    [view, setView] = useState("month"),
    [events, setEvents] = useState<CalendarItem[]>([]),
    [products, setProducts] = useState<{ id: number; name: string }[]>([]),
    [users, setUsers] = useState<{ id: string; name: string }[]>([]),
    [filter, setFilter] = useState({
      platform: "",
      content_type: "",
      status: "",
      campaign: "",
      assigned_user: "",
      event_type: "",
    }),
    [day, setDay] = useState<string | null>(null),
    [selected, setSelected] = useState<CalendarItem | null>(null),
    [form, setForm] = useState<Draft | null>(null),
    [files, setFiles] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useModalKeyboard(!!(form || selected || day), () => {
    if (form) setForm(null);
    else if (selected) setSelected(null);
    else setDay(null);
  });
  const load = useCallback(async () => {
    const data = await jsonRequest(endpoint);
    setEvents(data.events);
    setProducts(data.products ?? []);
    setUsers(data.users ?? []);
  }, [endpoint]);
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);
  const today = dateInZone(new Date(), zone),
    visible = events.filter(
      (e) =>
        (content ||
          scope === "all" ||
          !e.record_type ||
          (e.record_feature === scope &&
            e.record_type ===
              (scope === "orders"
                ? "order"
                : scope === "manufacturing"
                  ? "manufacturing"
                  : scope === "purchases"
                    ? "purchase"
                    : scope === "stocktakes"
                      ? "stocktake"
                      : scope === "products"
                        ? "product"
                        : "material"))) &&
        Object.entries(filter).every(
          ([key, value]) =>
            !value || String(e[key as keyof CalendarItem] ?? "") === value,
        ),
    );
  const editable = (event: CalendarItem) =>
    can(user, feature, "edit") &&
    (!event.record_feature || can(user, event.record_feature, "edit"));
  const first = cursor.slice(0, 7) + "-01",
    firstDay = new Date(first + "T12:00:00Z").getUTCDay(),
    weekStart = addDate(cursor, -new Date(cursor + "T12:00:00Z").getUTCDay());
  const dates =
    view === "month"
      ? Array.from({ length: 42 }, (_, i) => addDate(first, i - firstDay))
      : view === "week"
        ? Array.from({ length: 7 }, (_, i) => addDate(weekStart, i))
        : [cursor];
  const eventDate = (event: CalendarItem) =>
    event.all_day && event.source_date
      ? event.source_date
      : dateInZone(event.starts_at, zone);
  const matches = (date: string) =>
    visible
      .filter((e) => eventDate(e) === date)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  function blank(date = cursor): Draft {
    return {
      title: "",
      date,
      time: "09:00",
      timezone: zone,
      status: content ? "Draft" : "Scheduled",
      description: "",
      notes: "",
      event_type: "Task",
      record_type: null,
      record_id: null,
      platform: "Instagram",
      content_type: "Photo",
      hashtags: "",
      campaign: "",
      assigned_user: null,
      external_link: "",
      product_ids: [],
    };
  }
  function edit(e: CalendarItem, duplicate = false) {
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: e.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(e.starts_at));
    setForm({
      ...blank(dateInZone(e.starts_at, e.timezone)),
      ...e,
      id:
        duplicate || !e.id.startsWith(content ? "content:" : "event:")
          ? undefined
          : Number(e.id.split(":")[1]),
      copy_from: duplicate && content ? Number(e.id.split(":")[1]) : undefined,
      date:
        e.all_day && e.source_date
          ? e.source_date
          : dateInZone(e.starts_at, e.timezone),
      timezone: e.all_day ? zone : e.timezone,
      time: e.all_day ? "09:00" : local,
      title: duplicate ? e.title + " (copy)" : e.title,
      status: duplicate ? "Draft" : e.status,
      platform: e.platform ?? "Instagram",
      content_type: e.content_type ?? "Photo",
      hashtags: e.hashtags ?? "",
      campaign: e.campaign ?? "",
      assigned_user: e.assigned_user ?? null,
      external_link: e.external_link ?? "",
      product_ids: e.product_ids ?? [],
    });
    setSelected(null);
    setFiles([]);
    setMessage("");
  }
  async function save() {
    if (!form) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await jsonRequest(
        endpoint,
        form,
        form.id ? "PATCH" : "POST",
      );
      setForm({ ...form, id: result.id });
      await uploadAttachments(
        content ? "content" : "calendar",
        result.id,
        files,
      );
      setFiles([]);
      setForm(null);
      await load();
      window.dispatchEvent(new Event("keenventory-calendar-updated"));
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(e: CalendarItem) {
    if (
      !window.confirm(
        e.record_id
          ? "Remove this item from the calendar? Its original business record and history will be retained."
          : "Delete this item and its calendar entry?",
      )
    )
      return;
    try {
      await jsonRequest(
        endpoint,
        { id: content ? Number(e.id.split(":")[1]) : e.id, confirm: true },
        "DELETE",
      );
      setSelected(null);
      await load();
      setMessage("Removed.");
    } catch (error) {
      setMessage(String(error));
    }
  }
  useEffect(() => {
    const refresh = () => load().catch(() => {});
    window.addEventListener("keenventory-calendar-updated", refresh);
    return () =>
      window.removeEventListener("keenventory-calendar-updated", refresh);
  }, [load]);
  const field = (
    key: keyof Draft,
    label: string,
    options?: string[],
    type = "text",
  ) => (
    <label className="grid gap-1 text-sm" key={key}>
      {label}
      {options ? (
        <select
          aria-label={label}
          className={inputClass}
          value={String(form?.[key] ?? "")}
          onChange={(e) => setForm({ ...form!, [key]: e.target.value })}
        >
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          aria-label={label}
          required={["title", "date", "time", "timezone"].includes(key)}
          className={inputClass}
          type={type}
          value={String(form?.[key] ?? "")}
          onChange={(e) => setForm({ ...form!, [key]: e.target.value })}
        />
      )}
    </label>
  );
  function step(direction: number) {
    if (view === "month") {
      const d = new Date(first + "T12:00:00Z");
      d.setUTCMonth(d.getUTCMonth() + direction);
      setCursor(d.toISOString().slice(0, 10));
    } else setCursor(addDate(cursor, direction * (view === "week" ? 7 : 1)));
  }
  const upcoming = visible
    .filter(
      (e) =>
        e.starts_at >= new Date().toISOString() &&
        !["Cancelled", "Published"].includes(e.status),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (!mounted) return <p role="status">Loading calendar?</p>;
  return (
    <section className="space-y-5 rounded-3xl bg-white p-5 text-[#000E2D]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {content ? "Content Calendar" : "Calendar"}
        </h1>
        {can(user, feature, "create") && (
          <button
            className={buttonClass}
            onClick={() => {
              setForm(blank());
              setFiles([]);
            }}
          >
            {content ? "Add Content" : "Add Event"}
          </button>
        )}
      </header>
      {content && (
        <>
          <p className="text-sm text-[#868F9E]">
            Plan and track content for Keen Scents. Publishing status is
            recorded by your team.
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              [
                "Total Planned Posts",
                visible.filter((e) => e.status !== "Cancelled").length,
              ],
              [
                "Published Posts",
                visible.filter((e) => e.status === "Published").length,
              ],
              [
                "Draft Posts",
                visible.filter((e) =>
                  ["Idea", "Draft", "In Progress"].includes(e.status),
                ).length,
              ],
              ["Upcoming Posts", upcoming.length],
              [
                "Overdue Posts",
                visible.filter(
                  (e) =>
                    e.starts_at < new Date().toISOString() &&
                    !["Published", "Cancelled"].includes(e.status),
                ).length,
              ],
            ].map(([label, n]) => (
              <div className="rounded-xl bg-[#F4EAE8] p-3" key={label}>
                <p className="text-xs">{label}</p>
                <strong className="text-xl">{n}</strong>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-label="Previous period"
          className="rounded-xl border p-2"
          onClick={() => step(-1)}
        >
          <ChevronLeft size={18} />
        </button>
        <input
          aria-label="Calendar month and year"
          className="rounded-xl border p-2"
          type="month"
          value={cursor.slice(0, 7)}
          onChange={(e) => {
            if (e.target.value) setCursor(e.target.value + "-01");
          }}
        />
        <button
          aria-label="Next period"
          className="rounded-xl border p-2"
          onClick={() => step(1)}
        >
          <ChevronRight size={18} />
        </button>
        <button
          className="rounded-xl border p-2"
          onClick={() => setCursor(today)}
        >
          Today
        </button>
        <select
          aria-label="Calendar view"
          className="rounded-xl border p-2"
          value={view}
          onChange={(e) => setView(e.target.value)}
        >
          {["month", "week", "day", "list"].map((v) => (
            <option key={v} value={v}>
              {v[0].toUpperCase() + v.slice(1)}
            </option>
          ))}
        </select>
        <label className="text-sm">
          Timezone{" "}
          <select
            className="rounded-xl border p-2"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          >
            {Array.from(
              new Set([zone, ...Intl.supportedValuesOf("timeZone")]),
            ).map((z) => (
              <option key={z}>{z}</option>
            ))}
          </select>
        </label>
        {content && (
          <>
            <button
              className="text-sm underline"
              onClick={() => {
                setCursor(today);
                setView("week");
              }}
            >
              This Week
            </button>
            <button
              className="text-sm underline"
              onClick={() => {
                const d = new Date(today.slice(0, 7) + "-01T12:00:00Z");
                d.setUTCMonth(d.getUTCMonth() + 1);
                setCursor(d.toISOString().slice(0, 10));
                setView("month");
              }}
            >
              Upcoming Month
            </button>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {(content
          ? ["platform", "content_type", "status", "campaign", "assigned_user"]
          : ["event_type", "status"]
        ).map((key) => (
          <label className="grid gap-1 text-xs capitalize" key={key}>
            {key.replace("_", " ")}
            <select
              className="rounded-lg border p-2"
              value={filter[key as keyof typeof filter]}
              onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}
            >
              <option value="">All</option>
              {Array.from(
                new Set(
                  events
                    .map((e) => String(e[key as keyof CalendarItem] ?? ""))
                    .filter(Boolean),
                ),
              ).map((v) => (
                <option key={v} value={v}>
                  {key === "assigned_user"
                    ? (users.find((u) => u.id === v)?.name ?? "Assigned user")
                    : v}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {message && (
        <p role="status" className="rounded-xl bg-[#F4EAE8] p-3">
          {message}
        </p>
      )}
      {view === "list" ? (
        <div className="grid gap-2">
          {visible
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            .map((e) => (
              <button
                className="rounded-xl border p-3 text-left"
                key={e.id}
                onClick={() => setSelected(e)}
              >
                {eventDate(e)} · {e.title} · {e.status}
              </button>
            ))}
          {!visible.length && <p>No events match these filters.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div
            className={
              view === "day"
                ? "grid gap-2"
                : "grid min-w-[600px] grid-cols-7 gap-1"
            }
          >
            {view !== "day" &&
              ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <p className="p-2 text-center text-xs font-semibold" key={d}>
                  {d}
                </p>
              ))}
            {dates.map((date) => {
              const entries = matches(date);
              return (
                <div
                  key={date}
                  className={
                    "min-h-28 rounded-xl border p-2 " +
                    (date === today
                      ? "border-[#000E2D] bg-[#F4EAE8]"
                      : date.slice(0, 7) !== cursor.slice(0, 7) &&
                          view === "month"
                        ? "opacity-50"
                        : "")
                  }
                >
                  <button
                    aria-label={`Open ${date}`}
                    className="mb-2 flex w-full items-center justify-between text-sm"
                    onClick={() => {
                      setDay(date);
                      if (!entries.length && can(user, feature, "create")) {
                        setForm(blank(date));
                        setFiles([]);
                      }
                    }}
                  >
                    <span>{Number(date.slice(-2))}</span>
                    {entries.length > 0 && (
                      <span className="rounded-full bg-[#E8C9C9] px-1.5 text-xs">
                        {entries.length}
                      </span>
                    )}
                  </button>
                  {entries.slice(0, view === "day" ? 100 : 3).map((e) => (
                    <button
                      key={e.id}
                      className={
                        "mb-1 block w-full truncate rounded-md border-l-4 bg-[#F4EAE8] px-2 py-1 text-left text-xs " +
                        (e.status === "Published"
                          ? "border-emerald-500"
                          : e.platform === "TikTok"
                            ? "border-[#868F9E]"
                            : "border-[#E8C9C9]")
                      }
                      onClick={() => setSelected(e)}
                    >
                      {e.title}
                    </button>
                  ))}
                  {entries.length > 3 && view !== "day" && (
                    <button
                      className="text-xs underline"
                      onClick={() => setDay(date)}
                    >
                      +{entries.length - 3} more
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {content && (
        <section className="space-y-2 border-t pt-4">
          <h2 className="text-lg font-semibold">Upcoming Content</h2>
          {upcoming.slice(0, 20).map((e) => (
            <button
              key={e.id}
              className="block w-full rounded-lg border p-3 text-left text-sm"
              onClick={() => setSelected(e)}
            >
              {dateInZone(e.starts_at, zone)} · {e.title} · {e.platform}
            </button>
          ))}
          {!upcoming.length && (
            <p className="text-sm text-[#868F9E]">No upcoming content.</p>
          )}
        </section>
      )}
      {day && !form && !selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Events on selected day"
          className="fixed inset-0 z-40 overflow-auto bg-[#000E2D]/40 p-5"
        >
          <section className="mx-auto max-w-xl space-y-4 rounded-3xl bg-white p-6">
            <h2 className="text-xl">{day}</h2>
            {matches(day).map((e) => (
              <button
                key={e.id}
                className="block w-full rounded-lg border p-3 text-left"
                onClick={() => setSelected(e)}
              >
                {e.title} · {e.status}
              </button>
            ))}
            {can(user, feature, "create") && (
              <button
                className={buttonClass}
                onClick={() => {
                  setForm(blank(day));
                  setFiles([]);
                }}
              >
                Create {content ? "Content" : "Event"}
              </button>
            )}
            <button className="ml-4" onClick={() => setDay(null)}>
              Close
            </button>
          </section>
        </div>
      )}
      {selected && !form && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Event details"
          className="fixed inset-0 z-40 overflow-auto bg-[#000E2D]/40 p-5"
        >
          <section className="mx-auto max-w-2xl space-y-4 rounded-3xl bg-white p-6">
            <h2 className="text-2xl">{selected.title}</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              {Object.entries(selected)
                .filter(
                  ([k]) =>
                    ![
                      "all_day",
                      "source_date",
                      "record_feature",
                      "id",
                      "record_id",
                      "record_type",
                      "url",
                      "product_ids",
                      "organization_id",
                      "created_by",
                    ].includes(k),
                )
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs capitalize text-[#868F9E]">
                      {k.replaceAll("_", " ")}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words text-sm">
                      {k === "assigned_user"
                        ? (users.find((u) => u.id === v)?.name ?? "Unassigned")
                        : String(v ?? "—")}
                    </dd>
                  </div>
                ))}
            </dl>
            {content && !!selected.product_ids?.length && (
              <p>
                Associated Products:{" "}
                {selected.product_ids
                  .map(
                    (id) =>
                      products.find((p) => p.id === id)?.name ??
                      "Product #" + id,
                  )
                  .join(", ")}
              </p>
            )}
            {selected.url && (
              <a href={selected.url} className="block underline">
                Open Original Record
              </a>
            )}
            {selected.external_link && (
              <a
                className="block underline"
                href={selected.external_link}
                target="_blank"
                rel="noreferrer"
              >
                Open Content Link
              </a>
            )}
            {(content || selected.id.startsWith("event:")) && (
              <AttachmentGallery
                type={content ? "content" : "calendar"}
                id={Number(selected.id.split(":")[1])}
                editable={editable(selected)}
              />
            )}
            {selected.record_type === "product" && (
              <a
                href={`/?module=products&record=${selected.record_id}`}
                className="underline"
              >
                View Product Images
              </a>
            )}
            <div className="flex flex-wrap gap-3">
              {editable(selected) && (
                <button className={buttonClass} onClick={() => edit(selected)}>
                  Edit / Reschedule
                </button>
              )}
              {content && can(user, feature, "create") && (
                <button
                  className="rounded-xl border p-3"
                  onClick={() => edit(selected, true)}
                >
                  Duplicate Content
                </button>
              )}
              {content &&
                can(user, feature, "edit") &&
                selected.status !== "Published" && (
                  <button
                    className="underline"
                    onClick={async () => {
                      edit(selected);
                      setForm((current) =>
                        current ? { ...current, status: "Published" } : current,
                      );
                    }}
                  >
                    Mark as Published
                  </button>
                )}
              {can(user, feature, "delete") &&
                (!selected.record_feature ||
                  can(user, selected.record_feature, "edit")) && (
                  <button
                    className="text-red-700 underline"
                    onClick={() => remove(selected)}
                  >
                    Delete
                  </button>
                )}
              <button onClick={() => setSelected(null)}>Close</button>
            </div>
          </section>
        </div>
      )}
      {form && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={content ? "Content form" : "Event form"}
          className="fixed inset-0 z-50 overflow-auto bg-[#000E2D]/40 p-5"
        >
          <form
            className="mx-auto max-w-3xl space-y-5 rounded-3xl bg-white p-6"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <h2 className="text-xl font-semibold">
              {form.id ? "Edit" : content ? "Add Content" : "Add Event"}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("title", content ? "Content Title" : "Event Title")}
              {field("date", "Scheduled Date", undefined, "date")}
              {field("time", "Scheduled Time", undefined, "time")}
              {field("timezone", "Timezone")}
              {field(
                "status",
                "Status",
                content
                  ? statuses
                  : Array.from(
                      new Set([
                        form.status,
                        "Scheduled",
                        "Draft",
                        "In Progress",
                        "Completed",
                        "Cancelled",
                      ]),
                    ),
              )}
              {content ? (
                <>
                  {field("platform", "Platform", platforms)}
                  {field("content_type", "Content Type", types)}
                  {field("campaign", "Campaign Name")}
                  {field("hashtags", "Hashtags")}
                  {field(
                    "external_link",
                    "External Content Link",
                    undefined,
                    "url",
                  )}
                  <label className="grid gap-1 text-sm">
                    Assigned User
                    <select
                      className={inputClass}
                      value={form.assigned_user ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          assigned_user: e.target.value || null,
                        })
                      }
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    Associated Products
                    <select
                      multiple
                      className={inputClass}
                      value={form.product_ids.map(String)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          product_ids: Array.from(
                            e.target.selectedOptions,
                            (o) => Number(o.value),
                          ),
                        })
                      }
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  {field("event_type", "Event Type")}
                  <label className="grid gap-1 text-sm">
                    Original Record
                    <select
                      disabled={!!form.id}
                      className={inputClass}
                      value={
                        form.record_id
                          ? form.record_type + ":" + form.record_id
                          : ""
                      }
                      onChange={(e) => {
                        const [type, id] = e.target.value.split(":");
                        setForm({
                          ...form,
                          record_type: type || null,
                          record_id: id ? Number(id) : null,
                        });
                      }}
                    >
                      <option value="">Standalone event</option>
                      {events
                        .filter(
                          (e) =>
                            e.record_id &&
                            e.record_feature &&
                            can(user, e.record_feature, "edit"),
                        )
                        .map((e) => (
                          <option
                            key={e.id}
                            value={e.record_type + ":" + e.record_id}
                          >
                            {e.record_type} · {e.title}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            {(["description", "notes"] as const).map((k) => (
              <label key={k} className="grid gap-2 text-sm capitalize">
                {k === "description" && content ? "Caption / Description" : k}
                <textarea
                  className={inputClass}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </label>
            ))}
            <AttachmentGallery
              type={content ? "content" : "calendar"}
              id={form.id}
              pending={files}
              onPending={setFiles}
              editable={can(user, feature, "edit")}
            />
            {message && <p role="alert">{message}</p>}
            <button className={buttonClass} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="ml-4"
              onClick={() => setForm(null)}
            >
              Cancel
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
