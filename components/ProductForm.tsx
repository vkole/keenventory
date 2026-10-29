'use client';
import {ProductSavedImages} from './ProductSavedImages';
import { useEffect, useState } from 'react';
import type { ProductRecord } from '@/lib/productStore';
import type { ProductInput } from '@/lib/productStore';
export const inputClass =
  'w-full rounded-xl border border-[#E2E1E2] bg-white p-3 text-[#000E2D] disabled:bg-[#F4EAE8]';
export const buttonClass =
  'rounded-xl bg-[#000E2D] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50';
export const dollars = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    n,
  );
export async function jsonRequest(
  url: string,
  body?: unknown,
  method = 'POST',
) {
  const response = await fetch(
    url,
    body === undefined
      ? { cache: 'no-store' }
      : {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? 'Request failed.');
  return data;
}
export function ProductForm({
  product,
  parent,
  onSaved,
  onCancel,
}: {
  product?: ProductRecord;
  parent?: ProductRecord;
  onSaved: (id: number, another: boolean) => void;
  onCancel: () => void;
}) {
  const blank = (): ProductInput => ({
    name: '',
    sku: '',
    category: parent?.category ?? 'Candle',
    description: '',
    measurement_type: parent?.measurement_type ?? 'Units',
    stock_quantity: 0,
    cost_per_unit: 0,
    retail_price: parent?.retail_price ?? 0,
    wholesale_price: parent?.wholesale_price ?? 0,
    sale_quantity: 1,
    reorder_threshold: 0,
    state: 'Active',
    auto_manufacture: false,
    location: parent?.location ?? 'Finished Goods Storage',
    parent_id: parent?.id ?? null,
    attributes: {},
    barcode: '',
    confirm_sku_change: false,
  });
  const [form, setForm] = useState<ProductInput>(() =>
    product
      ? {
          ...product,
          auto_manufacture: !!product.auto_manufacture,
          attributes: JSON.parse(product.attributes),
          confirm_sku_change: false,
        }
      : blank(),
  );
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState(false);
  useEffect(() => {
    jsonRequest('/api/products/images?status=1')
      .then((d) => setStorage(d.configured))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreview(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  const definitions = JSON.parse(
    parent?.attribute_definitions ?? '{}',
  ) as Record<string, string[]>;
  function choose(items: File[]) {
    if (
      items.some(
        (f) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) ||
          f.size > 8 * 1024 * 1024,
      )
    ) {
      setMessage('Choose JPG, PNG or WebP files up to 8 MB each.');
      return;
    }
    setFiles(items);
  }
  async function save(another: boolean) {
    setBusy(true);
    setMessage('');
    try {
      if (
        product &&
        form.sku !== product.sku &&
        !window.confirm(
          'Change this SKU? Existing Shopify ID mappings will be preserved. Shopify SKU reconciliation is a separate action.',
        )
      )
        return;
      const result = await jsonRequest('/api/products', {
        ...form,
        confirm_sku_change: !!product && form.sku !== product.sku,
      });
      let imageError = '';
      for (const file of files) {
        const body = new FormData();
        body.set('product_id', String(result.id));
        body.set('file', file);
        const r = await fetch('/api/products/images', { method: 'POST', body });
        if (!r.ok) {
          imageError = (await r.json()).error;
          break;
        }
      }
      if (imageError) {
        setForm({ ...form, id: result.id, stock_quantity: 0 });
        setMessage(
          `Product saved. ${imageError} Reopen its image gallery to retry.`,
        );
        setFiles([]);
        return;
      }
      if (another) {
        setForm(blank());
        setFiles([]);
      }
      onSaved(result.id, another);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }
  const text = (
    label: string,
    key:
      'name' | 'sku' | 'category' | 'measurement_type' | 'location' | 'barcode',
  ) => (
    <label className="grid gap-1 text-sm">
      {label}
      <input
        required={key !== 'barcode'}
        className={inputClass}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  const numeric = (
    label: string,
    key:
      | 'stock_quantity'
      | 'cost_per_unit'
      | 'retail_price'
      | 'wholesale_price'
      | 'sale_quantity'
      | 'reorder_threshold',
    disabled = false,
  ) => (
    <label className="grid gap-1 text-sm">
      {label}
      <input
        required
        disabled={disabled}
        className={inputClass}
        type="number"
        min={key === 'sale_quantity' ? 0.000001 : 0}
        step="0.000001"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
      />
    </label>
  );
  const editing = !!form.id;
  return (
    <form
      className="card space-y-5 rounded-3xl p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save(
          (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') ===
            'another',
        );
      }}
    >
      <div className="flex justify-between">
        <h3 className="text-xl font-semibold">
          {editing ? 'Edit Product' : parent ? 'Add Variation' : 'New Product'}
        </h3>
        <button type="button" onClick={onCancel}>
          Close
        </button>
      </div>
      {parent && <p>Parent: {parent.name}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {text('Product name', 'name')}
        {text('SKU', 'sku')}
        <div className="flex items-end">
          <button
            type="button"
            className="underline"
            onClick={() => {
              const suggested = [form.name, ...Object.values(form.attributes)]
                .join('-')
                .toUpperCase()
                .replace(/[^A-Z0-9._+&-]+/g, '-')
                .slice(0, 90);
              if (
                !editing ||
                window.confirm('Replace the current SKU with this suggestion?')
              )
                setForm({ ...form, sku: suggested });
            }}
          >
            Suggest SKU
          </button>
        </div>
        {text('Category', 'category')}
        {text('Measurement type', 'measurement_type')}
        {numeric(
          editing
            ? 'On hand (use inventory actions to change)'
            : 'Starting quantity',
          'stock_quantity',
          editing,
        )}
        {numeric('Starting unit cost ($)', 'cost_per_unit', editing)}
        {numeric('Low stock limit', 'reorder_threshold')}
        <label className="grid gap-1 text-sm">
          State
          <select
            className={inputClass}
            value={form.state}
            onChange={(e) =>
              setForm({
                ...form,
                state: e.target.value as ProductInput['state'],
              })
            }
          >
            <option>Active</option>
            <option>Draft</option>
            <option>Inactive</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Auto manufacture
          <select
            className={inputClass}
            value={form.auto_manufacture ? 'Yes' : 'No'}
            onChange={(e) =>
              setForm({ ...form, auto_manufacture: e.target.value === 'Yes' })
            }
          >
            <option>No</option>
            <option>Yes</option>
          </select>
        </label>
        {numeric('Default sale price ($)', 'retail_price')}
        {numeric('Sale quantity', 'sale_quantity')}
        {numeric('Wholesale price ($)', 'wholesale_price')}
        {text('Default storage location', 'location')}
        {text('Barcode / tracking code', 'barcode')}
        {Object.entries(definitions).map(([name, values]) => (
          <label className="grid gap-1 text-sm" key={name}>
            {name}
            <select
              required
              className={inputClass}
              value={form.attributes[name] ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  attributes: { ...form.attributes, [name]: e.target.value },
                })
              }
            >
              <option value="">Choose {name}</option>
              {values.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="grid gap-1 text-sm">
        Description
        <textarea
          className={inputClass}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (storage) choose(Array.from(e.dataTransfer.files));
        }}
        className="rounded-xl border-2 border-dashed p-5"
      >
        <label className="grid gap-2">
          Product images · drag files here or choose files
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={!storage}
            onChange={(e) => choose(Array.from(e.target.files ?? []))}
          />
        </label>
        {!storage && (
          <p className="mt-2 text-sm text-[#868F9E]">
            Image uploads require persistent object storage. Configure the
            server’s S3 settings to enable uploads.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-3">
          {preview.map((src, i) => (
            <div key={src}>
              <img
                className="h-24 w-24 rounded-xl object-cover"
                src={src}
                alt={`Selected image ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, j) => i !== j))}
              >
                Remove selection
              </button>
            </div>
          ))}
        </div>
      </div>
      {product&&<ProductSavedImages id={product.id}/>}
      {editing && (
        <p className="text-sm text-[#868F9E]">
          Changing product information does not adjust inventory. Use the image
          gallery to replace or remove saved images.
        </p>
      )}
      {message && (
        <p role="alert" className="rounded-xl bg-[#F4EAE8] p-3">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button className={buttonClass} disabled={busy} type="submit">
          Save Product
        </button>
        <button
          className={buttonClass}
          disabled={busy}
          type="submit"
          value="another"
        >
          Save Product &amp; Add Another
        </button>
        <button
          type="button"
          className="rounded-xl border px-4"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
