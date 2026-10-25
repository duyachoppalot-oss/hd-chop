// scripts/etl/13_component_types.mjs
//
// Loads part_component_types (migration 008) from the "Component Types and
// Introduction Dates" section of the H-D service-portal parts catalogs
// (lib/componenttypes.mjs; DATA_RIGHTS row for the service portal: facts only).
// One row per part number: the H-D type code most books give, its name, the
// earliest introduction year any book gives, how many books list it.
//
// The dry run also previews what 06_concepts would do with the type
// (data/seed/component_type_concepts.csv: type code -> concept): parts with no
// concept today that would get one, and parts whose current concept the type
// disagrees with (06 never overwrites; those are listed for review).
//
// --apply replaces every row of part_component_types in one transaction.
// Independent of the fitment pipeline; re-run 06 --apply and 08 afterwards.
//
// Usage:
//   node scripts/etl/13_component_types.mjs           (dry run, writes reports/13_component_types_<ts>.txt + .csv)
//   node scripts/etl/13_component_types.mjs --apply

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { readComponentRows, summarize } from './lib/componenttypes.mjs';
import { available, CATALOG_EXTRACT_DIR } from './lib/servicecatalog.mjs';
import { readTypeMap } from './lib/concepts.mjs';

const APPLY = process.argv.includes('--apply');
const BATCH = 20000;
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

async function main() {
  if (!available()) throw new Error(`no catalog extract at ${CATALOG_EXTRACT_DIR}`);
  const { books, rows } = readComponentRows();
  const types = summarize(rows);
  const typeMap = readTypeMap();

  const parts = new Map(
    (await app.query(`SELECT p.oem_number, c.slug, (SELECT count(*) FROM fitment f WHERE f.oem_number = p.oem_number)::int AS fit
                      FROM oem_parts p LEFT JOIN part_concepts c USING (concept_id)`)).rows.map((r) => [r.oem_number, r])
  );
  const covered = types.filter((t) => parts.has(t.oem_number));
  const gain = new Map(), agree = [], disagree = [];
  for (const t of covered) {
    const slug = typeMap.get(t.type_code);
    if (!slug) continue;
    const p = parts.get(t.oem_number);
    if (!p.slug) (gain.get(slug) ?? gain.set(slug, []).get(slug)).push({ ...t, fit: p.fit });
    else if (p.slug === slug) agree.push(t);
    else disagree.push({ ...t, current: p.slug, typed: slug });
  }

  const L = [];
  L.push(`13_component_types — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  L.push(`Books with the section: ${books}; rows ${rows.length}; part numbers ${types.length}; H-D type codes ${new Set(types.map((t) => t.type_code)).size}`);
  L.push(`  with an introduction year: ${types.filter((t) => t.intro_year != null).length}; with more than one type across books: ${types.filter((t) => t.other_types.length).length}`);
  L.push(`Our parts: ${parts.size}; with a type: ${covered.length}; with a type and no concept: ${covered.filter((t) => !parts.get(t.oem_number).slug).length}`);
  L.push('');
  L.push(`Concept preview (data/seed/component_type_concepts.csv, ${typeMap.size} type codes):`);
  L.push(`  fill gaps: +${[...gain.values()].flat().length} parts (${[...gain.values()].flat().reduce((n, t) => n + t.fit, 0)} fitment rows)`);
  L.push(`  agrees with the current concept: ${agree.length}; disagrees (left alone, review): ${disagree.length}`);
  for (const [slug, ts2] of [...gain].sort((a, b) => b[1].length - a[1].length))
    L.push(`    ${slug.padEnd(17)} +${String(ts2.length).padStart(4)}  ${ts2.slice(0, 3).map((t) => t.oem_number).join(', ')}`);
  L.push('  disagreements (current -> H-D type), top 15:');
  const dc = new Map();
  for (const d of disagree) dc.set(`${d.current} -> ${d.typed}`, [...(dc.get(`${d.current} -> ${d.typed}`) ?? []), d.oem_number]);
  for (const [k, os] of [...dc].sort((a, b) => b[1].length - a[1].length).slice(0, 15)) L.push(`    ${String(os.length).padStart(3)}  ${k}  e.g. ${os.slice(0, 3).join(', ')}`);
  L.push('');
  L.push('Top type codes by part count:');
  const byCode = new Map();
  for (const t of types) byCode.set(t.type_code, (byCode.get(t.type_code) ?? 0) + 1);
  const nameOf = new Map(types.map((t) => [t.type_code, t.type_name]));
  for (const [c, n] of [...byCode].sort((a, b) => b[1] - a[1]).slice(0, 20)) L.push(`  ${c} ${nameOf.get(c).padEnd(36)} ${n}`);

  fs.mkdirSync('reports', { recursive: true });
  const rp = path.join('reports', `13_component_types_${ts}.txt`);
  fs.writeFileSync(rp, L.join('\n') + '\n');
  const cols = ['oem_number', 'type_code', 'type_name', 'intro_year', 'books', 'other_types'];
  fs.writeFileSync(rp.replace(/\.txt$/, '.csv'), [cols.join(','), ...types.map((t) => cols.map((c) => csvCell(c === 'other_types' ? t[c].join(' ') : t[c])).join(','))].join('\n') + '\n');
  console.log(L.join('\n'));
  console.log(`\n→ ${rp} (+ .csv).`);
  if (!APPLY) { console.log('Dry run: nothing written. --apply loads part_component_types (after migration 008).'); return; }

  const ok = (await app.query(`SELECT to_regclass('part_component_types') IS NOT NULL AS ok`)).rows[0].ok;
  if (!ok) throw new Error('part_component_types is missing: apply packages/db/migrations/008_part_component_types.sql first.');
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query('DELETE FROM part_component_types');
    let n = 0;
    for (let i = 0; i < types.length; i += BATCH) {
      const c = types.slice(i, i + BATCH);
      const res = await client.query(
        `INSERT INTO part_component_types (oem_number, type_code, type_name, intro_year, books, other_types)
         SELECT o, tc, tn, y, b, coalesce(string_to_array(nullif(ot, ''), ' '), '{}')
         FROM unnest($1::text[], $2::text[], $3::text[], $4::smallint[], $5::smallint[], $6::text[]) AS t(o, tc, tn, y, b, ot)`,
        [c.map((t) => t.oem_number), c.map((t) => t.type_code), c.map((t) => t.type_name), c.map((t) => t.intro_year), c.map((t) => t.books), c.map((t) => t.other_types.join(' '))]
      );
      n += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`Deleted ${del.rowCount}, inserted ${n} part_component_types rows. Next: 06 --apply, 08 --apply.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => app.end());
