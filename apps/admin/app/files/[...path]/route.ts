import fs from 'node:fs';
import { reportPath } from '@/lib/reports';

// Serves a file from the repo's reports/ folder (QR codes, CSVs, sweep output)
// so a task can link to it. Read-only, reports/ only.
const TYPES: Record<string, string> = { svg: 'image/svg+xml', csv: 'text/plain; charset=utf-8', txt: 'text/plain; charset=utf-8', html: 'text/plain; charset=utf-8', json: 'application/json' };

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.join('/');
  const file = reportPath(rel);
  if (!file) return new Response('Not found in reports/', { status: 404 });
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  return new Response(fs.readFileSync(file), { headers: { 'content-type': TYPES[ext] ?? 'text/plain; charset=utf-8' } });
}
