import { query } from '@/lib/db';
import { CATALOGS, isCatalog, KINDS, type Capture, type Kind } from '@/lib/catalog';

// Save / edit / delete a capture drawn in the catalog viewer.
const STATUS = ['new', 'reviewed', 'loaded', 'rejected'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const RETURN = 'capture_id, page, x0::float, y0::float, x1::float, y1::float, text, kind, note, status, created_at';

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const [x0, y0, x1, y1] = [b.x0, b.y0, b.x1, b.y1].map(num);
  if (!isCatalog(String(b.catalog)) || !Number.isInteger(b.page) || b.page < 1 || b.page > CATALOGS[b.catalog as 'vtwin'].pages)
    return Response.json({ error: 'bad catalog or page' }, { status: 400 });
  if ([x0, y0, x1, y1].some((v) => v == null)) return Response.json({ error: 'bad box' }, { status: 400 });
  if (!KINDS.includes(b.kind as Kind)) return Response.json({ error: 'bad kind' }, { status: 400 });
  const text = String(b.text ?? '').slice(0, 8000);
  if (!text.trim()) return Response.json({ error: 'empty text' }, { status: 400 });
  const [c] = await query<Capture>(
    `INSERT INTO catalog_captures (catalog, page, x0, y0, x1, y1, text, kind, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${RETURN}`,
    [b.catalog, b.page, Math.min(x0!, x1!), Math.min(y0!, y1!), Math.max(x0!, x1!), Math.max(y0!, y1!), text, b.kind, String(b.note ?? '').slice(0, 2000)]
  );
  return Response.json(c);
}

export async function PATCH(req: Request) {
  const b = await req.json().catch(() => ({}));
  const id = Number(b.capture_id);
  if (!Number.isInteger(id)) return Response.json({ error: 'bad id' }, { status: 400 });
  if (b.kind != null && !KINDS.includes(b.kind)) return Response.json({ error: 'bad kind' }, { status: 400 });
  if (b.status != null && !STATUS.includes(b.status)) return Response.json({ error: 'bad status' }, { status: 400 });
  const [c] = await query<Capture>(
    `UPDATE catalog_captures SET text = coalesce($2, text), kind = coalesce($3, kind), note = coalesce($4, note),
            status = coalesce($5, status), updated_at = now()
     WHERE capture_id = $1 RETURNING ${RETURN}`,
    [id, b.text == null ? null : String(b.text).slice(0, 8000), b.kind ?? null, b.note == null ? null : String(b.note).slice(0, 2000), b.status ?? null]
  );
  return c ? Response.json(c) : Response.json({ error: 'not found' }, { status: 404 });
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return Response.json({ error: 'bad id' }, { status: 400 });
  await query(`DELETE FROM catalog_captures WHERE capture_id = $1`, [id]);
  return Response.json({ ok: true });
}
