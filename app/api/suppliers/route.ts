import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, ensureDatabase } from '@/lib/db';

const supplierSchema = z.object({
  company_name: z.string().min(1),
  contact_name: z.string().min(1),
  email: z.string().default(''),
  phone: z.string().default(''),
  website: z.string().default(''),
  lead_time: z.string().default('7 days'),
  payment_terms: z.string().default('Net 30'),
  notes: z.string().default(''),
});

export async function GET() {
  ensureDatabase();
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY company_name ASC').all();
  return NextResponse.json({ suppliers });
}

export async function POST(request: Request) {
  const body = await request.json();
  const payload = supplierSchema.parse(body);

  const result = db
    .prepare(
      `INSERT INTO suppliers (company_name, contact_name, email, phone, website, lead_time, payment_terms, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      payload.company_name,
      payload.contact_name,
      payload.email,
      payload.phone,
      payload.website,
      payload.lead_time,
      payload.payment_terms,
      payload.notes,
    );

  return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) });
}
