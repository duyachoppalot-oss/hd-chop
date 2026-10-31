import { query } from '@/lib/db';
import { CAPTURE_COLS, CATALOGS, isCatalog, pageSize, pageWords, sectionOf, type Capture } from '@/lib/catalog';
import { suggest } from '@/lib/catalogSuggest';

// One catalog page for the viewer: size in points, word boxes, saved captures (skipped
// ones only block suggestions), suggested boxes. ?all=1: suggestions ignoring captures.
export async function GET(req: Request, { params }: { params: Promise<{ catalog: string; page: string }> }) {
  const { catalog, page: p } = await params;
  const page = Number(p);
  if (!isCatalog(catalog) || !Number.isInteger(page) || page < 1 || page > CATALOGS[catalog].pages)
    return Response.json({ error: 'unknown catalog or page' }, { status: 404 });
  const all = await query<Capture>(
    `SELECT ${CAPTURE_COLS} FROM catalog_captures WHERE catalog = $1 AND page = $2 ORDER BY capture_id`,
    [catalog, page]
  );
  const [{ total }] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM catalog_captures WHERE catalog = $1 AND status <> 'skipped'`, [catalog]
  );
  const words = pageWords(catalog, page);
  const ignoreTaken = new URL(req.url).searchParams.get('all') === '1';
  return Response.json({
    catalog, page, pages: CATALOGS[catalog].pages, section: sectionOf(catalog, page),
    ...(await pageSize(catalog, page)), words,
    captures: all.filter((c) => c.status !== 'skipped'),
    skipped: all.filter((c) => c.status === 'skipped').length,
    suggestions: suggest(words, ignoreTaken ? [] : all),
    total,
  });
}
