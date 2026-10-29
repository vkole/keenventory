import { secured } from '@/lib/access';
import { z } from 'zod';
import { db } from '@/lib/db';
import { event, product } from '@/lib/productStore';
async function handlePOST(request: Request) {
  try {
    const p = z
      .object({
        ids: z.array(z.number().int().positive()).min(1).max(5000),
        action: z.enum(['archive', 'restore']),
        confirm: z.literal(true),
      })
      .parse(await request.json());
    db.transaction(() => {
      for (const id of p.ids) {
        const row = product(db, id);
        if (row.merged_into_id)
          throw Error('Merged products cannot be restored or bulk edited.');
        db.prepare(
          'UPDATE products SET archived_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
        ).run(p.action === 'archive' ? new Date().toISOString() : null, id);
        event(db, id, p.action, { bulk: true });
      }
    }).immediate();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Bulk action failed.' },
      { status: 400 },
    );
  }
}

export const POST = secured('products', handlePOST);
