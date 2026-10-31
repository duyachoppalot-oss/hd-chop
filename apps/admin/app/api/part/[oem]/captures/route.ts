import { normOem } from '@/lib/db';
import { partCaptures } from '@/lib/partCaptures';

// GET /api/part/:oem/captures: catalog captures about this part (see lib/partCaptures.ts).
export async function GET(_req: Request, { params }: { params: Promise<{ oem: string }> }) {
  const d = await partCaptures(normOem(decodeURIComponent((await params).oem)));
  return d ? Response.json(d) : Response.json({ error: 'unknown part' }, { status: 404 });
}
