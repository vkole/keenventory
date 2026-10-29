import { secured } from '@/lib/access';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { headers, previewImport, importProducts } from '@/lib/productCsv';
import { createHash } from 'node:crypto';
async function handleGET() {
  return new Response(
    headers.join(',') +
      '\nSample Candle,KS-SAMPLE-12OZ,Candle,Example,Units,0,0,28,14,5,Active\n',
    {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="product-template.csv"',
      },
    },
  );
}
async function handlePOST(request: Request) {
  try {
    const p = z
      .object({
        csv: z.string().max(3 * 1024 * 1024),
        confirm: z.boolean().default(false),
        mode: z.enum(['skip', 'update']).default('skip'),
        opening_balances: z.boolean().default(false),
        preview_hash: z.string().optional(),
      })
      .parse(await request.json());
    const rows = previewImport(db, p.csv);
    const hash = createHash('sha256').update(JSON.stringify({
      csv: p.csv,
      mode: p.mode,
      opening_balances: p.opening_balances,
      rows,
    })).digest('hex');
    if (!p.confirm)
      return NextResponse.json({ rows, hash });
    if (hash !== p.preview_hash)
      throw Error('CSV, import options, or product matches changed. Validate and preview again before confirming.');
    return NextResponse.json(
      importProducts(db, p.csv, p.mode, p.opening_balances),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'CSV import failed.' },
      { status: 400 },
    );
  }
}

export const GET = secured('products', handleGET);

export const POST = secured('products', handlePOST);
