import { NextResponse, type NextRequest } from 'next/server';

// App key + CORS for every /v1/* route (docs/FIX_PLAN.md A3).
// HDCHOP_APP_KEYS: comma list in ~/hd-chop/api.env (several so a key can be rotated:
// add the new one, ship the app, drop the old one). The key ships inside the app binary,
// so it only stops casual scraping; the nginx rate limit and paid gating do the rest.
// CORS: only the Expo web dev server, and only outside production.

const PROD = process.env.NODE_ENV === 'production';
// HDCHOP_APP_KEYS, read per request (local dev: copied from the repo-root .env by next.config.ts).
const keys = () =>
  (process.env.HDCHOP_APP_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
const DEV_ORIGINS = new Set(['http://localhost:8081', 'http://localhost:8083', 'http://localhost:8084']);

function cors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin');
  if (PROD || !origin || !DEV_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'X-App-Key',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  };
}

function deny(status: number, error: string, headers: Record<string, string>): Response {
  return Response.json({ error }, { status, headers: { ...headers, 'Cache-Control': 'no-store' } });
}

export function middleware(req: NextRequest) {
  const headers = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const KEYS = keys();
  if (KEYS.length === 0) {
    // Fail closed in production; local dev without keys stays open.
    if (PROD) return deny(503, 'server not configured', headers);
  } else if (!KEYS.includes(req.headers.get('x-app-key') ?? '')) {
    return deny(401, 'missing or invalid app key', headers);
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: '/v1/:path*', runtime: 'nodejs' };
