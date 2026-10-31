import { query } from '@/lib/db';
import { CATALOGS, isCatalog, pageSize, pageWords, sectionOf, type Capture } from '@/lib/catalog';

// One catalog page for the viewer: size in points, word boxes, saved captures.
export async function GET(_req: Request, { params }: { params: Promise<{ catalog: string; page: string }> }) {
  const { catalog, page: p } = await params;
  const page = Number(p);
  if (!isCatalog(catalog) || !Number.isInteger(page) || page < 1 || page > CATALOGS[catalog].pages)
    return Response.json({ error: 'unknown catalog or page' }, { status: 404 });
  const captures = await query<Capture>(
    `SELECT capture_id, page, x0::float, y0::float, x1::float, y1::float, text, kind, note, status, created_at
     FROM catalog_captures WHERE catalog = $1 AND page = $2 ORDER BY capture_id`,
    [catalog, page]
  );
  const [{ total }] = await query<{ total: number }>(`SELECT count(*)::int AS total FROM catalog_captures WHERE catalog = $1`, [catalog]);
  return Response.json({
    catalog, page, pages: CATALOGS[catalog].pages, section: sectionOf(catalog, page),
    ...(await pageSize(catalog, page)), words: pageWords(catalog, page), captures, total,
  });
}
