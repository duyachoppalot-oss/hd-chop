import { familyDef, familySearch } from '@/lib/familySearch';
import { fail, handle, intParam, ok } from '@/lib/http';

// GET /v1/family-search?family=&q=[&from=&to=][&offset=]
// Every part for the words on the family's bikes, spans per model inside the
// family (lib/familySearch.ts). from/to cut the family to a year range;
// offset pages through results (page_size parts per concept).
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const f = familyDef(p.get('family') ?? '');
    const q = (p.get('q') ?? '').trim();
    const from = p.get('from') == null ? 1900 : intParam(p.get('from'), 1900, 2030);
    const to = p.get('to') == null ? 2030 : intParam(p.get('to'), 1900, 2030);
    const offset = p.get('offset') == null ? 0 : intParam(p.get('offset'), 0, 10000);
    if (!f) return fail(400, 'family is required (see /v1/families)');
    if (!q || q.length > 80) return fail(400, 'q is required (1-80 characters)');
    if (from == null || to == null || from > to) return fail(400, 'from/to must be years, from <= to');
    if (offset == null) return fail(400, 'offset must be a number');
    const body = await familySearch(f, q, from, to, offset);
    return ok(body, body.concepts.length > 0);
  });
}
