import { query } from '@/lib/db';
import { fail, handle, ok } from '@/lib/http';

// GET /v1/part/:oem — part detail, full supersession chain, all spans.
// Accepts any number in a chain ("61268-03", "6126803"); answers for the
// chain's newest number.
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
    return ok({ requested: chain.find((c) => c.oem.toUpperCase().replace(/[\s-]/g, '') === key)?.oem ?? oem, ...detail, chain, supersession, fits });
  });
}
