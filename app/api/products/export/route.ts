import { secured } from '@/lib/access';
import { db } from '@/lib/db';
import { products } from '@/lib/productStore';
import {
  csvReport,
  exportColumns,
  filterProducts,
  reportColumns,
} from '@/lib/productCsv';
export const dynamic = 'force-dynamic';
const escape = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
async function handleGET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const report = params.get('report') ?? 'stock';
    const columns = (
      params.get('columns')?.split(',') ?? reportColumns(report)
    ).filter((c) => exportColumns[c]);
    if (!columns.length) throw Error('Select export columns.');
    let rows = filterProducts(products(db), params);
    if(report==='worksheet'&&!params.get('location'))rows=rows.flatMap(p=>(p.locations??[]).map(l=>({...p,location:l.location,stock_quantity:l.quantity,reserved:l.reserved,consigned:l.consigned,available:l.available})));
    const ids = params.get('ids')?.split(',').map(Number);
    if (ids) rows = rows.filter((p) => ids.includes(p.id));
    if (params.get('format') === 'print') {
      return new Response(
        `<!doctype html><html><head><title>Product ${escape(report)} report</title><style>body{font:14px Arial;color:#000e2d;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:8px;text-align:left}@media print{button{display:none}}</style></head><body><h1>Product ${escape(report)} report</h1><button onclick="window.print()">Print report</button><table><thead><tr>${columns.map((c) => `<th>${escape(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((p) => `<tr>${columns.map((c) => `<td>${escape(exportColumns[c](p))}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
    return new Response(csvReport(rows, columns), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="product-${report.replace(/[^a-z]/g, '')}.csv"`,
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Export failed.' },
      { status: 400 },
    );
  }
}

export const GET = secured('products', handleGET);
