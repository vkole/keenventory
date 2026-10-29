"use client";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { jsonRequest, buttonClass } from "./ProductForm";
export async function uploadAttachments(
  type: string,
  id: number,
  files: File[],
) {
  for (const file of files) {
    const body = new FormData();
    body.set("owner_type", type);
    body.set("owner_id", String(id));
    body.set("file", file);
    const r = await fetch("/api/attachments", { method: "POST", body });
    if (!r.ok) throw Error((await r.json()).error);
  }
}
export function AttachmentGallery({
  type,
  id,
  editable = true,
  pending = [],
  onPending,
}: {
  type: "recipe" | "content" | "calendar";
  id?: number;
  editable?: boolean;
  pending?: File[];
  onPending?: (files: File[]) => void;
}) {
  const [rows, setRows] = useState<
      {
        id: number;
        filename: string;
        content_type: string;
        is_primary: number;
      }[]
    >([]),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [previews, setPreviews] = useState<string[]>([]);
  const load = useCallback(async () => {
    const status = await jsonRequest("/api/attachments?status=1");
    setReady(status.configured);
    if (id)
      setRows(
        (
          await jsonRequest(
            `/api/attachments?owner_type=${type}&owner_id=${id}`,
          )
        ).attachments,
      );
    else setRows([]);
  }, [id, type]);
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);
  useEffect(() => {
    const urls = pending.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [pending]);
  async function choose(files: File[]) {
    if (
      files.some(
        (f) =>
          ![
            "image/jpeg",
            "image/png",
            "image/webp",
            ...(type === "content" ? ["video/mp4", "video/webm"] : []),
          ].includes(f.type) ||
          f.size > (f.type.startsWith("image/") ? 8 : 40) * 1024 * 1024,
      )
    ) {
      setMessage(
        "Use JPG, PNG or WebP images up to 8 MB, or MP4/WebM videos up to 40 MB.",
      );
      return;
    }
    if (!id) {
      onPending?.(files);
      return;
    }
    setBusy(true);
    try {
      await uploadAttachments(type, id, files);
      await load();
      setMessage("Files uploaded.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">
        {type === "content" ? "Images & Videos" : "Images"}
      </h3>
      {editable && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (ready && !busy) choose(Array.from(e.dataTransfer.files));
          }}
          className="rounded-xl border-2 border-dashed p-4"
        >
          <label className="grid gap-2 text-sm">
            Drag files here or choose files
            <input
              type="file"
              multiple
              disabled={!ready || busy}
              accept={
                type === "content"
                  ? "image/jpeg,image/png,image/webp,video/mp4,video/webm"
                  : "image/jpeg,image/png,image/webp"
              }
              onChange={(e) => choose(Array.from(e.target.files ?? []))}
            />
          </label>
          {!ready && (
            <p className="mt-2 text-sm text-[#868F9E]">
              Connect persistent S3-compatible storage to enable uploads.
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-4">
        {previews.map((url, i) => (
          <div key={url}>
            {pending[i]?.type.startsWith("video/") ? (
              <video src={url} controls className="h-24 w-40 rounded-xl" />
            ) : (
              <Image
                unoptimized
                width={96}
                height={96}
                src={url}
                alt={`Selected ${i + 1}`}
                className="h-24 w-24 rounded-xl object-cover"
              />
            )}
            <button
              type="button"
              onClick={() => onPending?.(pending.filter((_, j) => j !== i))}
            >
              Remove selection
            </button>
          </div>
        ))}
        {rows.map((row) => (
          <div key={row.id} className="grid max-w-44 gap-2 text-xs">
            {row.content_type.startsWith("video/") ? (
              <video
                src={`/api/attachments?id=${row.id}`}
                controls
                className="h-28 w-40 rounded-xl"
              />
            ) : (
              <Image
                unoptimized
                width={112}
                height={112}
                src={`/api/attachments?id=${row.id}`}
                alt={row.filename}
                className="h-28 w-28 rounded-xl object-cover"
              />
            )}
            <span className="truncate">
              {row.filename}
              {row.is_primary ? " · Primary" : ""}
            </span>
            {editable && (
              <>
                <label className="grid gap-1">
                  Replace
                  <input
                    type="file"
                    disabled={!ready || busy}
                    accept={
                      type === "content"
                        ? "image/jpeg,image/png,image/webp,video/mp4,video/webm"
                        : "image/jpeg,image/png,image/webp"
                    }
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !id) return;
                      setBusy(true);
                      try {
                        const form = new FormData();
                        form.set("owner_type", type);
                        form.set("owner_id", String(id));
                        form.set("file", file);
                        const response = await fetch("/api/attachments", {
                          method: "POST",
                          body: form,
                        });
                        const result = await response.json();
                        if (!response.ok) throw Error(result.error);
                        if (row.is_primary)
                          await jsonRequest(
                            "/api/attachments",
                            { owner_type: type, owner_id: id, id: result.id },
                            "PATCH",
                          );
                        await jsonRequest(
                          "/api/attachments",
                          {
                            owner_type: type,
                            owner_id: id,
                            id: row.id,
                            confirm: true,
                          },
                          "DELETE",
                        );
                        await load();
                      } catch (error) {
                        setMessage(String(error));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="underline"
                  onClick={async () => {
                    try {
                      await jsonRequest(
                        "/api/attachments",
                        { owner_type: type, owner_id: id, id: row.id },
                        "PATCH",
                      );
                      await load();
                    } catch (e) {
                      setMessage(String(e));
                    }
                  }}
                >
                  Make Primary
                </button>
                <button
                  type="button"
                  className="text-red-700"
                  onClick={async () => {
                    if (window.confirm("Remove this attachment?"))
                      try {
                        await jsonRequest(
                          "/api/attachments",
                          {
                            owner_type: type,
                            owner_id: id,
                            id: row.id,
                            confirm: true,
                          },
                          "DELETE",
                        );
                        await load();
                      } catch (e) {
                        setMessage(String(e));
                      }
                  }}
                >
                  Remove
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
