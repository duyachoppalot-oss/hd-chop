import { lineage } from '@/lib/lineage';

// GET /api/lineage?oem=60665-89[&family=touring][&match=primary cover]
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const oem = u.get('oem') ?? '';
  if (!oem.trim()) return Response.json({ error: 'oem is required' }, { status: 400 });
  const d = await lineage(oem, u.get('family') ?? undefined, u.get('match') ?? undefined);
  return Response.json(d, { status: 'error' in d ? 404 : 200 });
}
