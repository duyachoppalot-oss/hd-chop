import { query } from '@/lib/db';
import { familyOf } from '@/lib/families';
import { fail, handle, intParam, ok } from '@/lib/http';

// Engine / transmission option from an H-D document (vehicle_specs, migration
// 006). Several = options sold that year (1981 FXE: 74 and 80 ci).
type Spec = {
  ci: number | null;
  cc: number | null;
  speeds: number | null;
  horsepower: string | null;
  compression: string | null;
  mid_year_change: boolean;
  source_ref: string;
};

// Stock wheel / tire / axle / fork tube / handlebar sizes (vehicle_chassis_specs,
// migration 012), our wording ('19 x 2.15 in', '100/90-19', '25 mm'). Several
// values = the source prints more than one stock size. [] when no source covers it.
const CHASSIS_KEYS = ['wheel_front', 'wheel_rear', 'tire_front', 'tire_rear',
  'axle_front', 'axle_rear', 'fork_tube', 'handlebar'] as const;
type Chassis = Record<(typeof CHASSIS_KEYS)[number], string[]>;

// Models for a year. has_parts = false for bikes no catalog covers, so the
// picker can show them greyed out instead of returning empty searches.
// specs = [] when no document covers the bike yet. chassis: see Chassis. family / family_key: the named
// bike the code belongs to (FLHRC -> "ROAD KING", key "touring:FLHR"), so the
// picker can fold one bike's codes into one row (lib/familyRule.ts).
export async function GET(req: Request) {
  return handle(async () => {
    const year = intParam(new URL(req.url).searchParams.get('year'), 1936, 2030);
    if (year == null) return fail(400, 'year is required (1936-2030)');
    const models = await query<{ model_code: string; model_name: string | null; platform: string; has_parts: boolean; specs: Spec[]; chassis_rows: Record<string, string[]> }>(
      `SELECT v.model_code, v.model_name, v.platform,
              EXISTS (SELECT 1 FROM fitment f WHERE f.vehicle_id = v.vehicle_id) AS has_parts,
              coalesce((SELECT json_agg(json_build_object(
                          'ci', s.displacement_ci::float8, 'cc', s.displacement_cc, 'speeds', s.transmission_speeds,
                          'horsepower', s.horsepower, 'compression', s.compression_ratio,
                          'mid_year_change', s.mid_year_change, 'source_ref', s.source_ref)
                        ORDER BY s.displacement_ci, s.transmission_speeds)
                        FROM vehicle_specs s WHERE s.vehicle_id = v.vehicle_id), '[]'::json) AS specs,
              coalesce((SELECT json_object_agg(k, vals) FROM (
                          SELECT c.item || CASE WHEN c.position = '' THEN '' ELSE '_' || c.position END AS k,
                                 json_agg(c.value ORDER BY c.size_mm, c.value) AS vals
                          FROM vehicle_chassis_specs c WHERE c.vehicle_id = v.vehicle_id
                          GROUP BY 1) g), '{}'::json) AS chassis_rows
       FROM vehicles v WHERE v.year = $1
       ORDER BY v.platform, v.model_code`,
      [year]
    );
    const withFamily = await Promise.all(
      models.map(async (m) => {
        const f = await familyOf(m.platform, m.model_code);
        const { chassis_rows, ...rest } = m;
        const chassis = Object.fromEntries(CHASSIS_KEYS.map((k) => [k, chassis_rows[k] ?? []])) as Chassis;
        return { ...rest, chassis, family: f?.name ?? null, family_key: f?.key ?? null };
      })
    );
    return ok({ year, models: withFamily });
  });
}
