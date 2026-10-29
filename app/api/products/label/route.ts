import { secured } from '@/lib/access';
import { db } from '@/lib/db';
import { product } from '@/lib/productStore';
import QRCode from 'qrcode';
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
async function handleGET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const p = product(db, Number(params.get('id')));
    const qr =
      params.get('qr') === 'true'
        ? await QRCode.toDataURL(p.barcode || p.sku, { width: 160, margin: 1 })
        : null;
    return new Response(
      `<!doctype html><html><head><title>${escape(p.sku)} label</title><style>body{font:18px Arial;color:#000e2d}article{width:320px;border:1px solid;padding:16px;text-align:center}img{display:block;margin:auto}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print tracking label</button><article><h2>${escape(p.name)}</h2><strong>${escape(p.sku)}</strong>${qr ? `<img src="${qr}" alt="Product QR code">` : ''}${p.barcode ? `<p>${escape(p.barcode)}</p>` : ''}</article></body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  } catch {
    return new Response('Product not found', { status: 404 });
  }
}

export const GET = secured('products', handleGET);
