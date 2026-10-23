import { fail, handle, intParam, modelParam, ok } from '@/lib/http';
import { findVehicle, search } from '@/lib/search';

// GET /v1/search?year=&model=&q=[&all=1]
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const year = intParam(p.get('year'), 1936, 2030);
    const model = modelParam(p.get('model'));
    const q = (p.get('q') ?? '').trim();
    if (year == null) return fail(400, 'year is required (1936-2030)');
    if (!model) return fail(400, 'model is required (model code, e.g. FLHR)');
    if (!q || q.length > 80) return fail(400, 'q is required (1-80 characters)');
    const vehicle = await findVehicle(year, model);
    if (!vehicle) return fail(404, `no vehicle ${year} ${model}`);
    const body = await search(vehicle, q, p.get('all') === '1');
    // Misses are logged on the request, so don't let the edge swallow repeats.
    return ok(body, body.concepts.length > 0);
  });
}
