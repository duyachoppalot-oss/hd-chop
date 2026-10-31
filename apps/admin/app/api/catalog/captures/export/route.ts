import { query } from '@/lib/db';

// Every capture as CSV (for building reviewed lists), oldest first.
const cell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  const rows = await query<Record<string, unknown>>(
    `SELECT capture_id, catalog, page, kind, status, text, note, x0, y0, x1, y1, created_at FROM catalog_captures ORDER BY capture_id`
  );
  const cols = ['capture_id', 'catalog', 'page', 'kind', 'status', 'text', 'note', 'x0', 'y0', 'x1', 'y1', 'created_at'];
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c] instanceof Date ? (r[c] as Date).toISOString() : r[c])).join(','))].join('\n');
  return new Response(csv + '\n', {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="catalog_captures.csv"' },
  });
}
