import { query } from '@/lib/db';
import { fail, handle, intParam, ok } from '@/lib/http';

// Models for a year. has_parts = false for bikes no catalog covers, so the
// picker can show them greyed out instead of returning empty searches.
export async function GET(req: Request) {
  return handle(async () => {
    const year = intParam(new URL(req.url).searchParams.get('year'), 1936, 2030);
    if (year == null) return fail(400, 'year is required (1936-2030)');
    const models = await query<{ model_code: string; model_name: string | null; platform: string; has_parts: boolean }>(
      `SELECT v.model_code, v.model_name, v.platform,
              EXISTS (SELECT 1 FROM fitment f WHERE f.vehicle_id = v.vehicle_id) AS has_parts
       FROM vehicles v WHERE v.year = $1
       ORDER BY v.platform, v.model_code`,
      [year]
    );
    return ok({ year, models });
  });
}
