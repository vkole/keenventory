"use client";
import { useEffect, useState, useCallback } from "react";
import { jsonRequest } from "./ProductForm";
export function ProductSavedImages({ id }: { id: number }) {
  const [images, setImages] = useState<{ id: number; is_primary: number }[]>(
      [],
    ),
    [message, setMessage] = useState("");
  const load = useCallback(
    async () =>
      setImages(
        (await jsonRequest("/api/products?id=" + id)).product.images ?? [],
      ),
    [id],
  );
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);
  async function remove(image: number) {
    if (!confirm("Remove this image?")) return;
    await jsonRequest(
      "/api/products/images",
      { product_id: id, image_id: image, confirm: true },
      "DELETE",
    );
    await load();
  }
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Saved Images</h3>
      <div className="flex flex-wrap gap-4">
        {images.map((image) => (
          <div className="grid gap-2 text-sm" key={image.id}>
            <img
              alt="Product"
              src={"/api/products/images?id=" + image.id}
              className="h-28 w-28 rounded-xl object-cover"
            />
            {image.is_primary ? (
              <span>Primary</span>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await jsonRequest(
                      "/api/products/images",
                      { product_id: id, image_id: image.id },
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
            )}
            <label>
              Replace
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const data = new FormData();
                    data.set("product_id", String(id));
                    data.set("file", file);
                    const r = await fetch("/api/products/images", {
                      method: "POST",
                      body: data,
                    });
                    if (!r.ok) throw Error((await r.json()).error);
                    await jsonRequest(
                      "/api/products/images",
                      { product_id: id, image_id: image.id, confirm: true },
                      "DELETE",
                    );
                    await load();
                  } catch (error) {
                    setMessage(String(error));
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="text-red-700"
              onClick={() =>
                remove(image.id).catch((e) => setMessage(e.message))
              }
            >
              Remove Image
            </button>
          </div>
        ))}
      </div>
      {message && <p role="alert">{message}</p>}
    </section>
  );
}
