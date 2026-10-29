import fs from 'node:fs';
import path from 'node:path';

// The local API (apps/api, `npm --prefix apps/api run dev`), for pages that
// should show exactly what the app gets (family search). X-App-Key = first key
// of HDCHOP_APP_KEYS in the repo-root .env.
export const API_BASE = process.env.HDCHOP_LOCAL_API ?? 'http://localhost:3001';

function appKey(): string {
  let keys = process.env.HDCHOP_APP_KEYS;
  const rootEnv = path.resolve(process.cwd(), '../../.env');
  if (!keys && fs.existsSync(rootEnv)) keys = /^HDCHOP_APP_KEYS=(.*)$/m.exec(fs.readFileSync(rootEnv, 'utf8'))?.[1];
  return (keys ?? '').split(',')[0].trim();
}

export async function apiGet<T>(p: string): Promise<{ ok: true; body: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(API_BASE + p, { headers: { 'X-App-Key': appKey() }, cache: 'no-store' });
    const body = await r.json().catch(() => null);
    return r.ok ? { ok: true, body: body as T } : { ok: false, error: body?.error ?? `HTTP ${r.status}` };
  } catch {
    return { ok: false, error: `Local API not reachable at ${API_BASE}. Start it: npm --prefix apps/api run dev` };
  }
}
