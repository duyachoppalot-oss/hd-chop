// Search by bike family instead of one year + model: pick Touring /
// Shovelhead / ..., type part words, get every part with its spans per model
// inside that family.
//   - Frame families = vehicles.platform, motor families = vehicles.engine.
//     Both come from 01_vehicles, which already reads code + year
//     (docs/HD_TERMINOLOGY.md): FL/FX before 1985 are platforms fl/fx, FXR is
//     its own platform, 1984 split-year bikes with no known engine (engine
//     null) are in no motor family.
//   - Words -> concept: resolveConcepts (search.ts), same as /v1/search.
//   - Spans are built from fitment on the family's bikes only (same rule as
//     the fitment_spans view: high/medium confidence, gaps-and-islands per
//     chain root + model + conditions), so a code reused on another platform
//     (FLH fl 1966-84 vs touring 1985) never leaks in.
import { query } from './db';
import { familyOf } from './families';
import { normalizeQuery, resolveConcepts, type Concept } from './search';

type Col = 'platform' | 'engine';
export type FamilyDef = { key: string; name: string; kind: 'frame' | 'motor'; col: Col; value: string };

// Order = order shown in the picker (oldest first within each kind).
export const FAMILIES: FamilyDef[] = [
  { key: 'fl', name: 'FL Big Twin', kind: 'frame', col: 'platform', value: 'fl' },
  { key: 'fx', name: 'FX Big Twin', kind: 'frame', col: 'platform', value: 'fx' },
  { key: 'sportster', name: 'Sportster', kind: 'frame', col: 'platform', value: 'sportster' },
  { key: 'touring', name: 'Touring', kind: 'frame', col: 'platform', value: 'touring' },
  { key: 'fxr', name: 'FXR', kind: 'frame', col: 'platform', value: 'fxr' },
  { key: 'softail', name: 'Softail', kind: 'frame', col: 'platform', value: 'softail' },
  { key: 'dyna', name: 'Dyna', kind: 'frame', col: 'platform', value: 'dyna' },
  { key: 'v_rod', name: 'V-Rod', kind: 'frame', col: 'platform', value: 'v_rod' },
  { key: 'trike', name: 'Trike', kind: 'frame', col: 'platform', value: 'trike' },
  { key: 'street', name: 'Street', kind: 'frame', col: 'platform', value: 'street' },
  { key: 'revolution_max', name: 'Revolution Max', kind: 'frame', col: 'platform', value: 'revolution_max' },
  { key: 'flathead', name: 'Flathead', kind: 'motor', col: 'engine', value: 'flathead' },
  { key: 'knucklehead', name: 'Knucklehead', kind: 'motor', col: 'engine', value: 'knucklehead' },
  { key: 'panhead', name: 'Panhead', kind: 'motor', col: 'engine', value: 'panhead' },
  { key: 'shovelhead', name: 'Shovelhead', kind: 'motor', col: 'engine', value: 'shovelhead' },
  { key: 'ironhead', name: 'Ironhead Sportster', kind: 'motor', col: 'engine', value: 'ironhead' },
  { key: 'evo', name: 'Evolution Big Twin', kind: 'motor', col: 'engine', value: 'evolution_bigtwin' },
  { key: 'evo_sportster', name: 'Evolution Sportster', kind: 'motor', col: 'engine', value: 'evolution_sportster' },
  { key: 'twin_cam', name: 'Twin Cam', kind: 'motor', col: 'engine', value: 'twin_cam' },
  { key: 'm8', name: 'Milwaukee-Eight', kind: 'motor', col: 'engine', value: 'milwaukee_eight' },
];

export const familyDef = (key: string) => FAMILIES.find((f) => f.key === key) ?? null;

export type FamilyInfo = { key: string; name: string; kind: 'frame' | 'motor'; year_start: number; year_end: number; models: number };

// Families that have bikes with parts (Knucklehead has no vehicles yet, so it
// stays hidden until it does).
export async function listFamilies(): Promise<FamilyInfo[]> {
  const rows = await query<{ col: Col; value: string; year_start: number; year_end: number; models: number }>(
    `WITH v AS (SELECT v.* FROM vehicles v WHERE EXISTS (SELECT 1 FROM fitment f WHERE f.vehicle_id = v.vehicle_id))
     SELECT 'platform' AS col, platform AS value, min(year) AS year_start, max(year) AS year_end, count(DISTINCT model_code)::int AS models FROM v GROUP BY platform
     UNION ALL
     SELECT 'engine', engine, min(year), max(year), count(DISTINCT model_code)::int FROM v WHERE engine IS NOT NULL GROUP BY engine`
  );
  const by = new Map(rows.map((r) => [`${r.col}:${r.value}`, r]));
  return FAMILIES.flatMap((f) => {
    const r = by.get(`${f.col}:${f.value}`);
    return r ? [{ key: f.key, name: f.name, kind: f.kind, year_start: r.year_start, year_end: r.year_end, models: r.models }] : [];
  });
}

export type FamilySpan = { model_code: string; model_name: string | null; family: string | null; family_key: string | null; year_start: number; year_end: number };
export type FamilyPart = {
  oem: string;
  replaces: string[];
  description: string | null;
  conditions: string[];
  condition_source: 'catalog_text' | 'inferred' | 'none';
  year_start: number;
  year_end: number;
  spans: FamilySpan[];
};

const MAX_PARTS = 60;
const FALLBACK_LIMIT = 20;

// The family's bikes, optionally cut to a year range. $1 = family value, $2/$3 = from/to.
const fv = (col: Col) => `fv AS (SELECT vehicle_id, year, model_code, platform, model_name FROM vehicles
                                 WHERE ${col} = $1 AND year BETWEEN $2 AND $3)`;

// Chain roots (with a sort key) for a concept / for trigram words.
async function conceptRoots(f: FamilyDef, from: number, to: number, conceptId: number) {
  return query<{ chain_root: string }>(
    `WITH ${fv(f.col)}
     SELECT p.chain_root FROM fitment fi JOIN oem_parts p USING (oem_number) JOIN fv USING (vehicle_id)
     WHERE fi.confidence IN ('high','medium') AND p.concept_id = $4
     GROUP BY 1 ORDER BY min(fv.year), 1`,
    [f.value, from, to, conceptId]
  );
}

async function fallbackRoots(f: FamilyDef, from: number, to: number, q: string) {
  return query<{ chain_root: string }>(
    `WITH ${fv(f.col)}
     SELECT p.chain_root FROM fitment fi JOIN oem_parts p USING (oem_number) JOIN fv USING (vehicle_id)
     WHERE fi.confidence IN ('high','medium') AND p.description_clean % $4
     GROUP BY 1 ORDER BY max(similarity(p.description_clean, $4)) DESC, 1 LIMIT ${FALLBACK_LIMIT}`,
    [f.value, from, to, q]
  );
}

// Parts (root + conditions) with spans per model, family bikes only, in the order of roots.
async function partsFor(f: FamilyDef, from: number, to: number, roots: string[]): Promise<FamilyPart[]> {
  if (!roots.length) return [];
  const spans = await query<{ chain_root: string; conditions: string[]; platform: string; model_code: string; model_name: string | null; year_start: number; year_end: number }>(
    `WITH ${fv(f.col)},
     y AS (
       SELECT DISTINCT p.chain_root, fi.conditions, fv.platform, fv.model_code, fv.year
       FROM fitment fi JOIN oem_parts p USING (oem_number) JOIN fv USING (vehicle_id)
       WHERE fi.confidence IN ('high','medium') AND p.chain_root = ANY($4::text[])
     ), g AS (
       SELECT *, year - row_number() OVER (PARTITION BY chain_root, conditions, platform, model_code ORDER BY year) AS grp FROM y
     )
     SELECT g.chain_root, g.conditions, g.platform, g.model_code, min(g.year)::int AS year_start, max(g.year)::int AS year_end,
            (SELECT v.model_name FROM fv v WHERE v.platform = g.platform AND v.model_code = g.model_code AND v.model_name IS NOT NULL
               AND v.year BETWEEN min(g.year) AND max(g.year) ORDER BY v.year DESC LIMIT 1) AS model_name
     FROM g GROUP BY g.chain_root, g.conditions, g.platform, g.model_code, g.grp
     ORDER BY year_start, g.model_code`,
    [f.value, from, to, roots]
  );
  const heads = await query<{ chain_root: string; conditions: string[]; oem: string; description: string | null; condition_source: FamilyPart['condition_source']; replaces: string[] }>(
    `WITH ${fv(f.col)},
     r AS (
       SELECT p.chain_root, fi.conditions,
              CASE WHEN bool_or(fi.condition_source = 'catalog_text') THEN 'catalog_text'
                   WHEN bool_or(fi.condition_source = 'inferred') THEN 'inferred' ELSE 'none' END AS condition_source
       FROM fitment fi JOIN oem_parts p USING (oem_number) JOIN fv USING (vehicle_id)
       WHERE fi.confidence IN ('high','medium') AND p.chain_root = ANY($4::text[])
       GROUP BY 1, 2
     )
     SELECT r.chain_root, r.conditions, r.condition_source, root.oem_display AS oem, root.description_clean AS description,
            coalesce((SELECT array_agg(o.oem_display ORDER BY o.oem_display) FROM oem_parts o
                      WHERE o.chain_root = r.chain_root AND o.oem_number <> r.chain_root), '{}') AS replaces
     FROM r JOIN oem_parts root ON root.oem_number = r.chain_root`,
    [f.value, from, to, roots]
  );

  const key = (root: string, c: string[]) => `${root}|${c.join(',')}`;
  const bySpan = new Map<string, FamilySpan[]>();
  for (const s of spans) {
    const fam = await familyOf(s.platform, s.model_code);
    const k = key(s.chain_root, s.conditions);
    if (!bySpan.has(k)) bySpan.set(k, []);
    bySpan.get(k)!.push({
      model_code: s.model_code,
      model_name: s.model_name,
      family: fam?.name ?? null,
      family_key: fam?.key ?? null,
      year_start: s.year_start,
      year_end: s.year_end,
    });
  }
  const order = new Map(roots.map((r, i) => [r, i]));
  return heads
    .map((h) => {
      const sp = bySpan.get(key(h.chain_root, h.conditions)) ?? [];
      return {
        _o: order.get(h.chain_root)!,
        oem: h.oem,
        replaces: h.replaces,
        description: h.description,
        conditions: h.conditions,
        condition_source: h.condition_source,
        year_start: Math.min(...sp.map((s) => s.year_start)),
        year_end: Math.max(...sp.map((s) => s.year_end)),
        spans: sp,
      };
    })
    .sort((a, b) => a._o - b._o || a.conditions.join().localeCompare(b.conditions.join()))
    .map(({ _o, ...p }) => p);
}

export async function familySearch(f: FamilyDef, rawQ: string, from: number, to: number, offset: number) {
  const q = normalizeQuery(rawQ);
  const { concepts, match } = await resolveConcepts(q);
  const results: { concept: { slug: string; display_name: string }; total: number; parts: FamilyPart[] }[] = [];
  for (const c of concepts as Concept[]) {
    const roots = (await conceptRoots(f, from, to, c.concept_id)).map((r) => r.chain_root);
    results.push({
      concept: { slug: c.slug, display_name: c.display_name },
      total: roots.length,
      parts: await partsFor(f, from, to, roots.slice(offset, offset + MAX_PARTS)),
    });
  }
  let fallback: FamilyPart[] | null = null;
  if (!concepts.length) {
    fallback = await partsFor(f, from, to, (await fallbackRoots(f, from, to, q)).map((r) => r.chain_root));
    try {
      await query(`INSERT INTO search_misses (query, vehicle_id) VALUES ($1, NULL)`, [q]);
    } catch (err) {
      console.error('search_misses insert failed', err);
    }
  }
  return {
    query: q,
    family: { key: f.key, name: f.name, kind: f.kind },
    years: { from, to },
    offset,
    page_size: MAX_PARTS,
    concepts: concepts.map((c) => ({ slug: c.slug, display_name: c.display_name, match })),
    results,
    fallback,
  };
}
