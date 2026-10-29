"use client";
import { useModalKeyboard } from "./useModalKeyboard";
import { useEffect, useState } from "react";
import { jsonRequest } from "./ProductForm";
export function RecordDrawer({
  excludeProducts = false,
}: {
  excludeProducts?: boolean;
}) {
  const [type, setType] = useState(""),
    [id, setId] = useState(0),
    [data, setData] = useState<{
      record: Record<string, unknown>;
      lines: Record<string, unknown>[];
      documents: { id: string; filename: string }[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search),
      selectedModule = p.get("module") ?? "",
      n = Number(p.get("record"));
    if (n && (!excludeProducts || selectedModule !== "products")) {
      setType(selectedModule);
      setId(n);
      jsonRequest(
        `/api/records?type=${encodeURIComponent(selectedModule)}&id=${n}`,
      )
        .then(setData)
        .catch((e) => setError(e.message));
    }
  }, [excludeProducts]);
  useModalKeyboard(!!id, close);
  if (!id) return null;
  function close() {
    setId(0);
    const url = new URL(window.location.href);
    url.searchParams.delete("record");
    window.history.replaceState(null, "", url);
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Original record"
      className="fixed inset-0 z-40 overflow-auto bg-[#000E2D]/40 p-4"
    >
      <section className="mx-auto max-w-3xl space-y-4 rounded-3xl bg-white p-6 text-[#000E2D]">
        <header className="flex justify-between gap-3">
          <h2 className="text-xl font-semibold capitalize">
            {type} · #{id}
          </h2>
          <button onClick={close}>Close</button>
        </header>
        {error && <p role="alert">{error}</p>}
        {!data && !error && <p>Loading record…</p>}
        {data && (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              {Object.entries(data.record)
                .filter(
                  ([k, v]) =>
                    ![
                      "organization_id",
                      "recipe_snapshot",
                      "consumption",
                      "attributes",
                      "attribute_definitions",
                    ].includes(k) &&
                    v !== null &&
                    typeof v !== "object",
                )
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs capitalize text-[#868F9E]">
                      {k.replaceAll("_", " ")}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {String(v)}
                    </dd>
                  </div>
                ))}
            </dl>
            {data.lines.length > 0 && (
              <section className="space-y-3">
                <h3 className="font-semibold">Line Items</h3>
                {data.lines.map((line, i) => (
                  <dl
                    key={i}
                    className="grid gap-2 rounded-xl border p-3 sm:grid-cols-3"
                  >
                    {Object.entries(line)
                      .filter(
                        ([k]) =>
                          ![
                            "organization_id",
                            "id",
                            "order_id",
                            "purchase_id",
                          ].includes(k),
                      )
                      .map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-xs capitalize">
                            {k.replaceAll("_", " ")}
                          </dt>
                          <dd>{String(v)}</dd>
                        </div>
                      ))}
                  </dl>
                ))}
              </section>
            )}
            {data.documents.map((d) => (
              <a
                key={d.id}
                className="block underline"
                href={`/api/imports?kind=${type}&download=${d.id}`}
              >
                Original Document: {d.filename}
              </a>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
