// Data changes only when the ETL runs, so responses cache at the edge.
const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';
// Public read-only GETs; lets the Expo web build call the API. Revisit when
// Phase 4 adds auth headers (those would need a preflight).
const CORS = { 'Access-Control-Allow-Origin': '*' };

export function ok(body: unknown, cache = true): Response {
  return Response.json(body, { headers: { ...CORS, 'Cache-Control': cache ? CACHE : 'no-store' } });
}

export function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { ...CORS, 'Cache-Control': 'no-store' } });
}

export function intParam(v: string | null, min: number, max: number): number | null {
  if (v == null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

export function modelParam(v: string | null): string | null {
  const s = (v ?? '').trim().toUpperCase();
  return /^[A-Z][A-Z0-9-]{0,14}$/.test(s) ? s : null;
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    return fail(500, 'internal error');
  }
}
