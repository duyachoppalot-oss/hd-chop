import { query } from '@/lib/db';
import { withFamilies } from '@/lib/families';
import { fail, handle, ok } from '@/lib/http';

// GET /v1/part/:oem — part detail, full supersession chain, all spans.
// Accepts any number in a chain ("61268-03", "6126803"); answers for the
// chain's newest number. Spans carry family / family_key (lib/families.ts).
export async function GET(_req: Request, ctx: { params: Promise<{ oem: string }> }) {
  return handle(async () => {
    const { oem } = await ctx.params;
    const key = decodeURIComponent(oem).toUpperCase().replace(/[\s-]/g, '');
    if (!/^[A-Z0-9]{3,16}$/.test(key)) return fail(400, 'invalid OEM number');
    const [part] = await query<{ oem_number: string; chain_root: string }>(
      `SELECT oem_number, chain_root FROM oem_parts WHERE oem_number = $1`,
      [key]
    );
    if (!part) return fail(404, `unknown OEM number ${oem}`);
    const root = part.chain_root;

    const [detail] = await query<{ oem: string; description: string | null; concept: string | null; concept_slug: string | null }>(
      `SELECT p.oem_display AS oem, p.description_clean AS description, c.display_name AS concept, c.slug AS concept_slug
       FROM oem_parts p LEFT JOIN part_concepts c USING (concept_id) WHERE p.oem_number = $1`,
      [root]
    );
    const chain = await query<{ oem: string; description: string | null; number_source: string }>(
      `SELECT oem_display AS oem, description_clean AS description, number_source
       FROM oem_parts WHERE chain_root = $1 ORDER BY oem_number = $1 DESC, oem_display`,
      [root]
    );
    const supersession = await query<{ from: string; to: string }>(
      `SELECT f.oem_display AS "from", t.oem_display AS "to"
       FROM oem_supersession s
       JOIN oem_parts f ON f.oem_number = s.from_oem JOIN oem_parts t ON t.oem_number = s.to_oem
       WHERE f.chain_root = $1 ORDER BY 1, 2`,
      [root]
    );
    const fits = await query<{ conditions: string[]; spans: { model_code: string; year_start: number; year_end: number }[] }>(
      `SELECT conditions,
              json_agg(json_build_object('model_code', model_code, 'year_start', year_start, 'year_end', year_end)
                       ORDER BY model_code, year_start) AS spans
       FROM fitment_spans WHERE chain_root = $1
       GROUP BY conditions ORDER BY conditions`,
      [root]
    );
    for (const f of fits) f.spans = await withFamilies(f.spans);
    const stock_sizes = await stockSizes(root);
    return ok({ requested: chain.find((c) => c.oem.toUpperCase().replace(/[\s-]/g, '') === key)?.oem ?? oem, ...detail, chain, supersession, fits, stock_sizes });
  });
}

// Stock cable / hose lengths (oem_part_lengths) and rotor diameters / sprocket teeth
// (oem_part_sizes) for every number in the chain. One entry per number + size; used_on
// lists the year / model text the source printed with it ("1987-06 FLT FXST FXSTC FLST").
const ITEM_LABEL: Record<string, string> = {
  clutch_cable: 'Clutch cable', throttle_cable: 'Throttle cable', speedometer_cable: 'Speedometer cable', tach_cable: 'Tach cable',
  battery_cable: 'Battery cable', brake_hose: 'Brake hose', brake_rotor: 'Brake rotor', engine_sprocket: 'Engine sprocket',
  compensator_sprocket: 'Compensator sprocket', countershaft_sprocket: 'Countershaft sprocket', rear_sprocket: 'Rear sprocket',
};
type SizeRow = { oem: string; item: string; position: string; value: string; num: number; detail: string; years: string; models: string };
async function stockSizes(root: string) {
  const rows = await query<SizeRow>(
    `SELECT p.oem_display AS oem, l.item, '' AS position, l.value, l.length_in::float AS num, l.detail, l.years, l.models
       FROM oem_part_lengths l JOIN oem_parts p USING (oem_number) WHERE p.chain_root = $1
     UNION ALL
     SELECT p.oem_display, s.item, s.position, s.value, s.value_num::float, s.detail, s.years, s.models
       FROM oem_part_sizes s JOIN oem_parts p USING (oem_number) WHERE p.chain_root = $1
     ORDER BY 2, 3, 5, 1`,
    [root]
  );
  const out = new Map<string, { oem: string; label: string; value: string; detail: string | null; used_on: string[] }>();
  for (const r of rows) {
    const k = [r.oem, r.item, r.position, r.value, r.detail].join('|');
    const label = [r.position ? r.position[0].toUpperCase() + r.position.slice(1) : '', (ITEM_LABEL[r.item] ?? r.item).toLowerCase()].filter(Boolean).join(' ');
    const e = out.get(k) ?? out.set(k, { oem: r.oem, label: label[0].toUpperCase() + label.slice(1), value: r.value, detail: r.detail || null, used_on: [] }).get(k)!;
    for (const on of usedOn(r.years, r.models)) if (!e.used_on.includes(on)) e.used_on.push(on);
  }
  return [...out.values()];
}

// years '1984-99 / 1980-86' + models 'FXST; FXWG' -> ['1984-99 FXST', '1980-86 FXWG'];
// lists of different lengths stay one entry.
function usedOn(years: string, models: string): string[] {
  const ys = years.split(' / ').map((y) => y.trim()).filter(Boolean);
  const ms = models.split(';').map((m) => m.trim()).filter(Boolean);
  if (ys.length > 1 && ys.length === ms.length) return ys.map((y, i) => `${y} ${ms[i]}`);
  const one = `${ys.join(', ')} ${ms.join(', ')}`.trim();
  return one ? [one] : [];
}
