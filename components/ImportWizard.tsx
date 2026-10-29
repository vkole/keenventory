"use client";
import { useModalKeyboard } from "./useModalKeyboard";
import { useState, useEffect, useCallback } from "react";
import {
  productImportFields,
  orderImportFields,
  type ImportRow,
} from "@/lib/importTypes";
import type { PreviewRow } from "@/lib/importStore";
import { buttonClass, inputClass, jsonRequest } from "./ProductForm";
const aliases: Record<string, string> = {
  saleprice: "Retail Price",
  unitcost: "Cost Price",
  startingquantity: "Stock Quantity",
  lowstocklimit: "Reorder Level",
  status: "Product Status",
  productsku: "Product SKU",
  customer: "Customer Name",
  channel: "Sales Channel",
  total: "Order Total",
};
export function ImportWizard({
  kind,
  onClose,
  onSaved,
}: {
  kind: "products" | "orders";
  onClose: () => void;
  onSaved: () => void;
}) {
  useModalKeyboard(true, onClose);
  const fields = kind === "products" ? productImportFields : orderImportFields,
    zone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  const [id, setId] = useState(""),
    [source, setSource] = useState<ImportRow[]>([]),
    [mapping, setMapping] = useState<Record<string, string>>({}),
    [rows, setRows] = useState<ImportRow[]>([]),
    [text, setText] = useState(""),
    [mode, setMode] = useState("skip"),
    [opening, setOpening] = useState(false),
    [preview, setPreview] = useState<{
      rows: PreviewRow[];
      hash: string;
      failed: number;
    } | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0),
    [jobs, setJobs] = useState<
      {
        id: string;
        filename: string;
        status: string;
        created_at: string;
        importing_user: string;
        result: string;
      }[]
    >([]),
    [matches, setMatches] = useState<{ sku: string; name: string }[]>([]),
    [result, setResult] = useState<Record<string, number> | null>(null);
  const load = useCallback(
    () => jsonRequest("/api/imports?kind=" + kind).then((d) => setJobs(d.jobs)),
    [kind],
  );
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
    if (kind === "orders")
      jsonRequest("/api/products")
        .then((d) => setMatches(d.products))
        .catch(() => {});
  }, [kind, load]);
  function invalidate() {
    setPreview(null);
    setResult(null);
  }
  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    invalidate();
    setId("");
    setSource([]);
    setRows([]);
    setText("");
    try {
      const body = new FormData();
      body.set("kind", kind);
      body.set("file", file);
      const r = await fetch("/api/imports", { method: "POST", body });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setId(data.id);
      setSource(data.rows);
      setRows([]);
      setText(data.extracted_text);
      const mapped: Record<string, string> = {};
      for (const h of data.fields) {
        const normalized = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        mapped[h] =
          fields.find(
            (f) => f.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized,
          ) ??
          aliases[normalized] ??
          "";
      }
      setMapping(mapped);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  function apply() {
    const chosen = Object.values(mapping).filter(Boolean);
    if (new Set(chosen).size !== chosen.length) {
      setMessage("Map each destination field only once.");
      return;
    }
    setRows(
      source.map((row) =>
        Object.fromEntries(
          Object.entries(mapping)
            .filter(([, to]) => to)
            .map(([from, to]) => [to, row[from] ?? ""]),
        ),
      ),
    );
    setPage(0);
    invalidate();
    setMessage("Review and correct the mapped rows, then validate.");
  }
  async function validate(confirm = false) {
    setBusy(true);
    setMessage("");
    try {
      const data = await jsonRequest("/api/imports", {
        id,
        rows,
        mode,
        opening,
        timezone: zone,
        confirm,
        preview_hash: preview?.hash,
      });
      if (confirm) {
        setResult(data);
        setPreview(null);
        await load();
        onSaved();
        setMessage("Import completed.");
      } else {
        setPreview(data);
        setMessage(
          data.failed
            ? "Correct the highlighted validation errors."
            : "All rows validated. Confirm to import.",
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }
  const template =
    "data:text/csv;charset=utf-8," +
    encodeURIComponent(fields.join(",") + "\n");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={"Import " + kind}
      className="fixed inset-0 z-50 overflow-auto bg-[#000E2D]/40 p-3 sm:p-7"
    >
      <section className="mx-auto max-w-[1400px] space-y-5 rounded-3xl bg-white p-5">
        <header className="flex justify-between">
          <h2 className="text-2xl font-semibold">
            Import {kind === "products" ? "Products" : "Orders"}
          </h2>
          <button onClick={onClose}>Close</button>
        </header>
        <p className="text-sm text-[#868F9E]">
          Upload, map columns, review every row, and validate before confirming.{" "}
          {kind === "orders"
            ? "PDF text is extracted for review; image-only documents require manual entry."
            : "Existing inventory and unit costs are preserved. Opening quantities apply only to new records when explicitly selected."}
        </p>
        <a
          className="underline"
          download={kind + "-template.csv"}
          href={template}
        >
          Download CSV Template
        </a>
        <label className="grid gap-2">
          Upload Document
          <input
            disabled={busy}
            type="file"
            accept={kind === "orders" ? ".csv,.xlsx,.pdf" : ".csv,.xlsx"}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
        </label>
        {text && (
          <details className="rounded-xl border p-3">
            <summary>Extracted PDF Text</summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
              {text}
            </pre>
          </details>
        )}
        {source.length > 0 && (
          <>
            <h3 className="font-semibold">Column Mapping</h3>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Object.keys(source[0]).map((h) => (
                <label className="grid gap-1 text-sm" key={h}>
                  {h}
                  <select
                    className={inputClass}
                    value={mapping[h] ?? ""}
                    onChange={(e) => {
                      setMapping({ ...mapping, [h]: e.target.value });
                      invalidate();
                    }}
                  >
                    <option value="">Ignore Column</option>
                    {fields.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button className={buttonClass} onClick={apply}>
              Apply Mapping
            </button>
          </>
        )}
        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap gap-4">
              <label>
                Existing Matches
                <select
                  className="ml-2 rounded-lg border p-2"
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    invalidate();
                  }}
                >
                  <option value="skip">Skip Existing</option>
                  {kind === "products" && (
                    <option value="update">Update Eligible Fields</option>
                  )}
                  <option value="create">Create New Only</option>
                </select>
              </label>
              {kind === "products" && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={opening}
                    onChange={(e) => {
                      setOpening(e.target.checked);
                      invalidate();
                    }}
                  />
                  Explicit opening-balance import for NEW products
                </label>
              )}
            </div>
            <p className="text-xs text-[#868F9E]">
              {kind === "orders"
                ? "Discount is a line discount; shipping and tax are order-level amounts. Fulfilled, qualifying orders deduct available stock once. Pending orders reserve stock. Draft and cancelled orders do not deduct stock."
                : "Blank cells preserve existing values when updating. Supplier, size, scent, variant and image URL are saved as product metadata."}
            </p>
            <div className="max-h-[440px] overflow-auto">
              <table className="text-left text-xs">
                <thead>
                  <tr>
                    <th className="p-2">Row / Action</th>
                    {fields.map((f) => (
                      <th className="min-w-40 p-2" key={f}>
                        {f}
                      </th>
                    ))}
                    <th className="min-w-52 p-2">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(page * 25, (page + 1) * 25).map((row, i) => {
                    const index = page * 25 + i,
                      p = preview?.rows[index];
                    return (
                      <tr key={index} className="border-t">
                        <td className="p-2">
                          {index + 2}
                          <select
                            aria-label={`Row ${index + 2} action`}
                            value={row._action ?? ""}
                            className="mt-1 w-28 rounded border p-1"
                            onChange={(e) => {
                              setRows(
                                rows.map((r, j) =>
                                  j === index
                                    ? { ...r, _action: e.target.value }
                                    : r,
                                ),
                              );
                              invalidate();
                            }}
                          >
                            <option value="">Automatic</option>
                            <option value="create">Create</option>
                            {kind === "products" && (
                              <option value="update">Update</option>
                            )}
                            <option value="skip">Skip</option>
                          </select>
                        </td>
                        {fields.map((f) => (
                          <td className="p-1" key={f}>
                            {kind === "orders" && f === "Product SKU" ? (
                              <input
                                aria-label={`Row ${index + 2} ${f}`}
                                list="import-product-skus"
                                className="w-40 rounded border p-2"
                                value={row[f] ?? ""}
                                onChange={(e) => {
                                  setRows(
                                    rows.map((r, j) =>
                                      j === index
                                        ? { ...r, [f]: e.target.value }
                                        : r,
                                    ),
                                  );
                                  invalidate();
                                }}
                              />
                            ) : (
                              <input
                                aria-label={`Row ${index + 2} ${f}`}
                                className="w-40 rounded border p-2"
                                value={row[f] ?? ""}
                                onChange={(e) => {
                                  setRows(
                                    rows.map((r, j) =>
                                      j === index
                                        ? { ...r, [f]: e.target.value }
                                        : r,
                                    ),
                                  );
                                  invalidate();
                                }}
                              />
                            )}
                          </td>
                        ))}
                        <td className="p-2 text-red-700">
                          {p
                            ? p.errors.join("; ") ||
                              `${p.action}${p.match_id ? " #" + p.match_id : ""}`
                            : "Not validated"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <datalist id="import-product-skus">
              {matches.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.name}
                </option>
              ))}
            </datalist>
            <div className="flex items-center gap-4">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                Page {page + 1} / {Math.ceil(rows.length / 25)}
              </span>
              <button
                disabled={(page + 1) * 25 >= rows.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
              <button
                disabled={busy}
                className={buttonClass}
                onClick={() => validate()}
              >
                Validate & Preview
              </button>
              {preview && (
                <button
                  disabled={busy || preview.failed > 0}
                  className={buttonClass}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Confirm this import? Only validated, selected rows will be committed.",
                      )
                    )
                      validate(true);
                  }}
                >
                  Confirm Import
                </button>
              )}
            </div>
          </>
        )}
        {busy && <p role="status">Processing document…</p>}
        {message && (
          <p role="alert" className="rounded-xl bg-[#F4EAE8] p-3">
            {message}
          </p>
        )}
        {result && (
          <p>
            Created: {result.created} · Updated: {result.updated} · Skipped:{" "}
            {result.skipped} · Failed: {result.failed}
          </p>
        )}
        <section className="space-y-3 border-t pt-4">
          <h3 className="font-semibold">Import History</h3>
          {jobs.map((job) => (
            <div
              className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm"
              key={job.id}
            >
              <a
                className="underline"
                href={`/api/imports?kind=${kind}&download=${job.id}`}
              >
                {job.filename}
              </a>
              <span>{job.created_at}</span>
              <span>{job.importing_user}</span>
              <span>{job.status}</span>
              {job.result && (
                <span>
                  {Object.entries(JSON.parse(job.result))
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </span>
              )}
            </div>
          ))}
          {!jobs.length && (
            <p className="text-sm text-[#868F9E]">No imports yet.</p>
          )}
        </section>
      </section>
    </div>
  );
}
