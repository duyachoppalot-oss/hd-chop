// scripts/dev/search.mjs
//
// Read-only command-line version of the SPEC search pipeline, for checking
// data before the API exists (Phase 2 can port it).
//   1. words -> concept: exact match on user_terms / hd_terms / display_name,
//      else pg_trgm similarity >= 0.4; up to 3 candidates
//   2. concept + vehicle -> fitment -> chain roots
//   3. spans for those roots: the selected model always; other models only if
//      the span overlaps the year +/- 10
//   4. grouped by chain root + conditions; newest number shown, older chain
//      members as "replaces"
//
// Usage: node scripts/dev/search.mjs <year> <model_code> <words...>
//   node scripts/dev/search.mjs 2004 FLHR gas tank

import 'dotenv/config';
import pg from 'pg';

const [year, model, ...words] = process.argv.slice(2);
if (!year || !model || !words.length) {
  console.error('Usage: node scripts/dev/search.mjs <year> <model_code> <words...>');
  process.exit(1);
}
const q = words.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
const YEAR_WINDOW = 10;

const db = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
await db.connect();
try {
  const v = (await db.query(`SELECT vehicle_id, model_name FROM vehicles WHERE year = $1 AND model_code = $2`, [Number(year), model.toUpperCase()])).rows[0];
  if (!v) throw new Error(`No vehicle ${year} ${model}`);

  const terms = `
    SELECT concept_id, slug, display_name, t
    FROM part_concepts, unnest(user_terms || hd_terms || ARRAY[lower(display_name)]) AS t`;
  let concepts = (await db.query(`SELECT DISTINCT concept_id, slug, display_name FROM (${terms}) x WHERE lower(t) = $1`, [q])).rows;
  let how = 'exact';
  if (!concepts.length) {
    concepts = (
      await db.query(
        `SELECT concept_id, slug, display_name, max(similarity(lower(t), $1)) AS sim
         FROM (${terms}) x WHERE similarity(lower(t), $1) >= 0.4
         GROUP BY 1, 2, 3 ORDER BY sim DESC LIMIT 3`,
        [q]
      )
    ).rows;
    how = 'trigram';
  }
  console.log(`${year} ${model.toUpperCase()} (${v.model_name}) + "${q}" -> ${concepts.length ? concepts.map((c) => `${c.display_name} [${how}]`).join(', ') : 'no concept'}`);
  if (!concepts.length) process.exit(0);

  const concept = concepts[0];
  const rows = (
    await db.query(
      `WITH roots AS (
         SELECT DISTINCT p.chain_root, f.conditions
         FROM fitment f JOIN oem_parts p USING (oem_number)
         WHERE f.vehicle_id = $1 AND p.concept_id = $2 AND f.confidence IN ('high','medium')
       )
       SELECT r.chain_root, root.oem_display, root.description_clean, s.conditions, s.model_code, s.year_start, s.year_end,
              (SELECT string_agg(oem_display, ', ' ORDER BY oem_display) FROM oem_parts o
                 WHERE o.chain_root = r.chain_root AND o.oem_number <> r.chain_root) AS replaces,
              (SELECT bool_or(f.condition_source = 'inferred') FROM fitment f JOIN oem_parts o USING (oem_number)
                 WHERE o.chain_root = r.chain_root AND f.vehicle_id = $1) AS inferred
       FROM roots r
       JOIN oem_parts root ON root.oem_number = r.chain_root
       JOIN fitment_spans s ON s.chain_root = r.chain_root AND s.conditions = r.conditions
       WHERE s.model_code = $3 OR (s.year_end >= $4 - ${YEAR_WINDOW} AND s.year_start <= $4 + ${YEAR_WINDOW})
       ORDER BY root.oem_display, s.conditions, s.model_code = $3 DESC, s.year_start, s.model_code`,
      [v.vehicle_id, concept.concept_id, model.toUpperCase(), Number(year)]
    )
  ).rows;

  const groups = new Map();
  for (const r of rows) {
    const k = `${r.chain_root}|${r.conditions.join(',')}`;
    if (!groups.has(k)) groups.set(k, { ...r, spans: [] });
    groups.get(k).spans.push(`${r.model_code} ${r.year_start}${r.year_end > r.year_start ? '-' + r.year_end : ''}`);
  }
  console.log(`${concept.display_name}: ${groups.size} part(s) fit your ${year} ${model.toUpperCase()}`);
  for (const g of groups.values()) {
    const cond = g.conditions.length ? ` {${g.conditions.join(', ')}${g.inferred ? ' ~inferred' : ''}}` : '';
    console.log(`  ● ${g.oem_display.padEnd(12)} ${(g.description_clean ?? '').slice(0, 34)}${cond}`);
    if (g.replaces) console.log(`      replaces ${g.replaces}`);
    const own = g.spans.filter((s) => s.startsWith(`${model.toUpperCase()} `));
    const other = g.spans.filter((s) => !s.startsWith(`${model.toUpperCase()} `));
    console.log(`      ${own.join(', ')}${other.length ? `  | also: ${other.slice(0, 8).join(', ')}${other.length > 8 ? ` +${other.length - 8} more` : ''}` : ''}`);
  }
} finally {
  await db.end();
}
