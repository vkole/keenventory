"use client";
import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  reportTypes,
  reportPresets,
  type ReportResult,
} from "@/lib/reportTypes";
import { can, type Viewer } from "@/lib/permissions";
import { dateInZone, addDate } from "@/lib/calendarDates";
import { jsonRequest, inputClass, buttonClass } from "./ProductForm";
function presetRange(preset: string, today: string) {
  const d = new Date(today + "T12:00:00Z"),
    y = d.getUTCFullYear(),
    m = d.getUTCMonth(),
    iso = (yy: number, mm: number, day: number) =>
      new Date(Date.UTC(yy, mm, day, 12)).toISOString().slice(0, 10);
  if (preset === "Today") return [today, today];
  if (preset === "Yesterday") return [addDate(today, -1), addDate(today, -1)];
  if (preset === "Last 7 Days") return [addDate(today, -6), today];
  if (preset === "Last 30 Days") return [addDate(today, -29), today];
  if (preset === "This Month") return [iso(y, m, 1), iso(y, m + 1, 0)];
  if (preset === "Last Month") return [iso(y, m - 1, 1), iso(y, m, 0)];
  if (preset === "This Quarter")
    return [
      iso(y, Math.floor(m / 3) * 3, 1),
      iso(y, Math.floor(m / 3) * 3 + 3, 0),
    ];
  if (preset === "Last Quarter")
    return [
      iso(y, Math.floor(m / 3) * 3 - 3, 1),
      iso(y, Math.floor(m / 3) * 3, 0),
    ];
  if (preset === "Last Year") return [iso(y - 1, 0, 1), iso(y - 1, 11, 31)];
  if (preset === "This Year") return [iso(y, 0, 1), iso(y, 11, 31)];
  if (preset === "Year to Date") return [iso(y, 0, 1), today];
  return ["1900-01-01", today];
}
export function ReportsWorkspace({ user }: { user: Viewer }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const allowed = reportTypes.filter((r) => {
    const c = r[2];
    return c === "Sales"
      ? can(user, "orders") && (r[0] === "orders" || can(user, "orderTotals"))
      : c === "Inventory"
        ? can(user, "products") &&
          can(user, "materials") &&
          can(user, "components") &&
          (r[0] !== "inventory_value" || can(user, "materialCosts"))
        : c === "Manufacturing"
          ? can(user, "manufacturing") &&
            (["volume", "production_history"].includes(r[0]) ||
              can(user, "materialCosts"))
          : can(user, "profitability") &&
            can(user, "materialCosts") &&
            can(user, "orderTotals");
  });
  const zone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    today = dateInZone(new Date(), zone);
  const [preset, setPreset] = useState("Last 30 Days"),
    [start, setStart] = useState(addDate(today, -29)),
    [end, setEnd] = useState(today),
    [type, setType] = useState<string>(allowed[0]?.[0] ?? ""),
    [chart, setChart] = useState("bar"),
    [grouping, setGrouping] = useState("daily"),
    [filters, setFilters] = useState({
      category: "",
      location: "",
      channel: "",
    }),
    [report, setReport] = useState<ReportResult | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const query = useMemo(
    () =>
      new URLSearchParams({
        type,
        start,
        end,
        grouping,
        timezone: zone,
        ...filters,
      }).toString(),
    [type, start, end, grouping, zone, filters],
  );
  useEffect(() => {
    if (!type) return;
    let active = true;
    setBusy(true);
    jsonRequest("/api/reports?" + query)
      .then((d) => {
        if (active) {
          setReport(d);
          setMessage("");
        }
      })
      .catch((e) => {
        if (active) {
          setMessage(e.message);
          setReport(null);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [query, type]);
  const format = (v: number | null | undefined) =>
    v === null || v === undefined
      ? "Unavailable"
      : report?.unit === "currency"
        ? new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
          }).format(v)
        : report?.unit === "percent"
          ? v.toFixed(2) + "%"
          : v.toLocaleString();
  const series =
    report?.type === "revenue_cost" ? (
      <>
        <Bar dataKey="revenue" name="Revenue" fill="#000E2D" />
        <Bar dataKey="production_cost" name="Production Cost" fill="#E8C9C9" />
      </>
    ) : null;
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="label" />
      <YAxis />
      <Tooltip formatter={(v) => format(Number(v))} />
      <Legend />
    </>
  );
  if (!mounted) return <p role="status">Loading reports?</p>;
  return (
    <section className="space-y-5 rounded-3xl bg-white p-5">
      <h1 className="text-2xl font-semibold">Reports & Analytics</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">
          Date Range
          <select
            aria-label="Date Range"
            className={inputClass}
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              if (e.target.value !== "Custom Date Range") {
                const [a, b] = presetRange(e.target.value, today);
                setStart(a);
                setEnd(b);
              }
            }}
          >
            {reportPresets.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Start Date
          <input
            className={inputClass}
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setPreset("Custom Date Range");
            }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          End Date
          <input
            className={inputClass}
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setPreset("Custom Date Range");
            }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Report Type
          <select
            aria-label="Report Type"
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {["Sales", "Inventory", "Manufacturing", "Profitability"].map(
              (c) => (
                <optgroup key={c} label={c}>
                  {allowed
                    .filter((r) => r[2] === c)
                    .map((r) => (
                      <option key={r[0]} value={r[0]}>
                        {r[1]}
                      </option>
                    ))}
                </optgroup>
              ),
            )}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Group By
          <select
            aria-label="Group By"
            className={inputClass}
            value={grouping}
            onChange={(e) => setGrouping(e.target.value)}
          >
            {["daily", "weekly", "monthly", "quarterly", "yearly"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Chart Type
          <select
            aria-label="Chart Type"
            className={inputClass}
            value={
              report?.categorical ? chart : chart === "pie" ? "bar" : chart
            }
            onChange={(e) => setChart(e.target.value)}
          >
            {[
              "line",
              "bar",
              "area",
              ...(report?.categorical ? ["pie"] : []),
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {Object.keys(filters).map((k) => (
          <label key={k} className="grid gap-1 text-sm capitalize">
            {k}
            <input
              className={inputClass}
              placeholder={"All " + k + "s"}
              value={filters[k as keyof typeof filters]}
              onChange={(e) => setFilters({ ...filters, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {busy && <p role="status">Loading report…</p>}
      {message && <p role="alert">{message}</p>}
      {!allowed.length && (
        <p>Your permissions do not include any report data.</p>
      )}
      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Selected Period", report.summary.value],
              ["Previous Period", report.summary.previous],
              ["Change", report.summary.change_percent],
            ].map(([label, v]) => (
              <div
                className="rounded-xl bg-[#F4EAE8] p-4"
                key={label as string}
              >
                <p className="text-xs">{label}</p>
                <strong className="text-xl">
                  {label === "Change"
                    ? v === null
                      ? "Unavailable"
                      : Number(v).toFixed(2) + "%"
                    : format(v as number | null)}
                </strong>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#868F9E]">
            {report.start} to {report.end} · {report.timezone} · Generated{" "}
            {new Date(report.generated_at).toLocaleString()}
          </p>
          {report.warnings.map((w) => (
            <p key={w} className="rounded-xl bg-amber-50 p-3 text-sm">
              {w}
            </p>
          ))}
          {!report.rows.length ? (
            <p className="py-10 text-center text-[#868F9E]">
              No stored records match this report and date range.
            </p>
          ) : (
            <div className="h-80 w-full">
              <ResponsiveContainer>
                {report.type === "revenue_cost" ? (
                  <BarChart data={report.rows}>
                    {common}
                    {series}
                  </BarChart>
                ) : chart === "pie" && report.categorical ? (
                  <PieChart>
                    <Pie
                      data={report.rows.map((r) => ({
                        ...r,
                        value: Math.abs(r.value ?? 0),
                      }))}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={65}
                      outerRadius={115}
                    >
                      {report.rows.map((r, i) => (
                        <Cell
                          key={r.label}
                          fill={
                            ["#000E2D", "#868F9E", "#E8C9C9", "#B59B8F"][i % 4]
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => format(Number(v))} />
                    <Legend />
                  </PieChart>
                ) : chart === "line" ? (
                  <LineChart data={report.rows}>
                    {common}
                    <Line
                      dataKey="value"
                      name={report.title}
                      stroke="#000E2D"
                    />
                    <Line
                      dataKey="previous"
                      name="Previous period"
                      stroke="#B59B8F"
                    />
                  </LineChart>
                ) : chart === "area" ? (
                  <AreaChart data={report.rows}>
                    {common}
                    <Area
                      dataKey="value"
                      name={report.title}
                      stroke="#000E2D"
                      fill="#E8C9C9"
                    />
                    <Area
                      dataKey="previous"
                      name="Previous period"
                      stroke="#868F9E"
                      fill="#F4EAE8"
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={report.rows}>
                    {common}
                    <Bar dataKey="value" name={report.title} fill="#000E2D" />
                    <Bar
                      dataKey="previous"
                      name="Previous period"
                      fill="#E8C9C9"
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {can(user, "reporting", "export") &&
              ["csv", "xlsx", "pdf"].map((format) => (
                <a
                  key={format}
                  className={buttonClass}
                  href={"/api/reports?" + query + "&format=" + format}
                >
                  Export Report · {format.toUpperCase()}
                </a>
              ))}
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Period / Item</th>
                  <th>Value</th>
                  <th>Previous Period</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.label} className="border-t">
                    <td className="p-2">{r.label}</td>
                    <td>{format(r.value)}</td>
                    <td>{format(r.previous)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
