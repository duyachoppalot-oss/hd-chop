// Search pipeline (docs/SPEC.md "Search pipeline"), ported from
// scripts/dev/search.mjs.
//   1. words -> concept: exact on user_terms / hd_terms / display_name (also
//      the singular of the query), else pg_trgm similarity >= 0.4; up to 3
//   2. concept + vehicle -> high/medium fitment -> chain roots + conditions
//   3. spans per root: the selected model always; other models only if the
//      span overlaps year +/- YEAR_WINDOW (or all=true)
//   4. one entry per chain root + conditions: newest number, older numbers
//      under replaces
//   5. no concept -> trigram on description_clean for that vehicle, and the
//      query is logged to search_misses
import { query } from './db';
import { withFamilies } from './families';

const YEAR_WINDOW = 10;
const MAX_CONCEPTS = 3;
const FALLBACK_LIMIT = 20;

export type Span = { model_code: string; year_start: number; year_end: number; family?: string | null; family_key?: string | null };
export type PartResult = {
  oem: string;
  replaces: string[];
  description: string | null;
  conditions: string[];
  condition_source: 'catalog_text' | 'inferred' | 'none';
  spans: Span[];
};
export type Concept = { concept_id: number; slug: string; display_name: string };
export type Vehicle = { vehicle_id: number; year: number; model_code: string; model_name: string | null; platform: string };

export function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').trim();
}

// "blinkers" -> "blinker", "brake pads" -> "brake pad", "boxes" -> "box".
function singular(q: string): string {
  return q.replace(/(ss|us)$/, '$1').replace(/(x|ch|sh)es$/, '$1').replace(/([^s])s$/, '$1');
}

const TERMS = `
  SELECT c.concept_id, c.slug, c.display_name, lower(t) AS t
  FROM part_concepts c, unnest(c.user_terms || c.hd_terms || ARRAY[c.display_name]) AS t`;

export async function resolveConcepts(q: string): Promise<{ concepts: Concept[]; match: 'exact' | 'trigram' | 'none' }> {
  const forms = [...new Set([q, singular(q)])];
  const exact = await query<Concept>(
    `SELECT DISTINCT concept_id, slug, display_name FROM (${TERMS}) x WHERE t = ANY($1::text[]) ORDER BY concept_id LIMIT ${MAX_CONCEPTS}`,
    [forms]
  );
  if (exact.length) return { concepts: exact, match: 'exact' };
  const fuzzy = await query<Concept>(
    `SELECT concept_id, slug, display_name FROM (${TERMS}) x
     WHERE similarity(t, $1) >= 0.4
     GROUP BY 1, 2, 3 ORDER BY max(similarity(t, $1)) DESC LIMIT ${MAX_CONCEPTS}`,
    [q]
  );
  return { concepts: fuzzy, match: fuzzy.length ? 'trigram' : 'none' };
}

export async function findVehicle(year: number, model: string): Promise<Vehicle | null> {
  const rows = await query<Vehicle>(
    `SELECT vehicle_id, year, model_code, model_name, platform FROM vehicles WHERE year = $1 AND model_code = $2`,
    [year, model]
  );
  return rows[0] ?? null;
}

// Spans + replaces for a set of (chain_root, conditions) groups.
const GROUP_DETAIL = `
  SELECT r.chain_root, root.oem_display AS oem, root.description_clean AS description, r.conditions, r.cs AS condition_source,
         coalesce((SELECT array_agg(o.oem_display ORDER BY o.oem_display) FROM oem_parts o
                   WHERE o.chain_root = r.chain_root AND o.oem_number <> r.chain_root), '{}') AS replaces,
         coalesce((SELECT json_agg(json_build_object('model_code', s.model_code, 'year_start', s.year_start, 'year_end', s.year_end)
                            ORDER BY s.model_code = $2 DESC, s.year_start, s.model_code)
                   FROM fitment_spans s
                   WHERE s.chain_root = r.chain_root AND s.conditions = r.conditions
                     AND (s.model_code = $2 OR $4 OR (s.year_end >= $3 - ${YEAR_WINDOW} AND s.year_start <= $3 + ${YEAR_WINDOW}))), '[]') AS spans
  FROM roots r JOIN oem_parts root ON root.oem_number = r.chain_root`;

const ROOTS_SELECT = `
  SELECT p.chain_root, f.conditions,
         CASE WHEN bool_or(f.condition_source = 'catalog_text') THEN 'catalog_text'
              WHEN bool_or(f.condition_source = 'inferred') THEN 'inferred' ELSE 'none' END AS cs`;

export async function partsForConcept(v: Vehicle, conceptId: number, all: boolean): Promise<PartResult[]> {
  return query<PartResult>(
    `WITH roots AS (
       ${ROOTS_SELECT}
       FROM fitment f JOIN oem_parts p USING (oem_number)
       WHERE f.vehicle_id = $1 AND f.confidence IN ('high','medium') AND p.concept_id = $5
       GROUP BY 1, 2
     )
     ${GROUP_DETAIL}
     ORDER BY root.oem_display, r.conditions`,
    [v.vehicle_id, v.model_code, v.year, all, conceptId]
  );
}

export async function fallbackParts(v: Vehicle, q: string, all: boolean): Promise<PartResult[]> {
  return query<PartResult>(
    `WITH hits AS (
       SELECT p.chain_root, max(similarity(p.description_clean, $5)) AS sim
       FROM fitment f JOIN oem_parts p USING (oem_number)
       WHERE f.vehicle_id = $1 AND f.confidence IN ('high','medium') AND p.description_clean % $5
       GROUP BY 1 ORDER BY 2 DESC LIMIT ${FALLBACK_LIMIT}
     ), roots AS (
       ${ROOTS_SELECT}
       FROM fitment f JOIN oem_parts p USING (oem_number) JOIN hits h ON h.chain_root = p.chain_root
       WHERE f.vehicle_id = $1 AND f.confidence IN ('high','medium')
       GROUP BY 1, 2
     )
     ${GROUP_DETAIL}
     JOIN hits h ON h.chain_root = r.chain_root
     ORDER BY h.sim DESC, root.oem_display`,
    [v.vehicle_id, v.model_code, v.year, all, q]
  );
}

export async function logMiss(q: string, vehicleId: number): Promise<void> {
  try {
    await query(`INSERT INTO search_misses (query, vehicle_id) VALUES ($1, $2)`, [q, vehicleId]);
  } catch (err) {
    console.error('search_misses insert failed', err);
  }
}

export async function search(v: Vehicle, rawQ: string, all: boolean) {
  const q = normalizeQuery(rawQ);
  const { concepts, match } = await resolveConcepts(q);
  const results = [];
  for (const c of concepts) {
    results.push({ concept: { slug: c.slug, display_name: c.display_name }, parts: await partsForConcept(v, c.concept_id, all) });
  }
  let fallback: PartResult[] | null = null;
  if (!concepts.length) {
    fallback = await fallbackParts(v, q, all);
    await logMiss(q, v.vehicle_id);
  }
  for (const p of [...results.flatMap((r) => r.parts), ...(fallback ?? [])]) p.spans = await withFamilies(p.spans);
  return {
    query: q,
    vehicle: { year: v.year, model_code: v.model_code, model_name: v.model_name, platform: v.platform },
    concepts: concepts.map((c) => ({ slug: c.slug, display_name: c.display_name, match })),
    results,
    fallback,
  };
}
