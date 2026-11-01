import { query } from '@/lib/db';
import { fail, handle, ok } from '@/lib/http';

// VIN -> our bike. Decodes with NHTSA vPIC (public US-government decoder): for H-D,
// Series = the model code (FLHX) and ModelYear = the year, so a 17-character VIN (1981 on)
// lands on vehicles (year, model_code). An engine suffix NHTSA sometimes adds (FLHX103) is
// tried without it. match = null when vPIC can't name the model or we have no such bike.
const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ vin: string }> }) {
  return handle(async () => {
    const vin = (await params).vin.trim().toUpperCase();
    if (!VIN.test(vin)) return fail(400, 'vin must be 17 characters (no I, O or Q)');
    const r = await fetch(`${VPIC}/${vin}?format=json`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return fail(502, 'VIN decoder unavailable');
    const d: Record<string, string> = ((await r.json()) as { Results?: Record<string, string>[] }).Results?.[0] ?? {};
    if (!/HARLEY/i.test(d.Make ?? '')) return ok({ vin, decoded: null, match: null, note: 'not a Harley-Davidson VIN' }, false);
    const year = Number(d.ModelYear) || null;
    const series = String(d.Series ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const codes = [series, series.replace(/(96|103|107|110|114|117|131)$/, '')].filter(Boolean);
    const rows = year && codes.length
      ? await query<{ year: number; model_code: string; model_name: string | null; platform: string }>(
          `SELECT year, model_code, model_name, platform FROM vehicles WHERE year = $1 AND model_code = ANY($2)
           ORDER BY array_position($2, model_code) LIMIT 1`, [year, codes])
      : [];
    return ok({
      vin,
      decoded: { year, model_code: series || null, model: d.Model || null, cc: Number(d.DisplacementCC) || null, errors: d.ErrorCode && d.ErrorCode !== '0' ? d.ErrorText : null },
      match: rows[0] ?? null,
    }, false); // a VIN is the rider's: not cached
  });
}
