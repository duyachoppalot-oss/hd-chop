// scripts/etl/04_conditions.mjs
//
// Sets fitment.conditions + condition_source for source = 'oem_catalog' rows
// (ETL_PLAN step 04). Rows are re-targeted exactly as 03 (lib/fitment.mjs), so
// every catalog row that produced a fitment row contributes its text.
//
// 1. Text tags per catalog row (lib/conditions.mjs): market lists ->
//    california | non_california | hdi; qualifier pieces -> abs, non_abs, efi,
//    carb, cast_wheel, laced_wheel. Never from `category` (sticky headings).
// 2. Per (part, vehicle), over every contributing row: tags are unioned (a
//    restriction anywhere is shown); markets are unioned (a row with no market
//    list covers every market). Contradictory pairs (abs + non_abs, efi + carb,
//    cast + laced) are dropped and listed for review.
// 3. EFI/carb inference: for each year where both X and XI exist and catalogs
//    cover both, a part that fits XI but not X is tagged efi on XI; one that
//    fits X but not XI is tagged carb on X.
// 4. conditions sorted + deduped; condition_source = catalog_text if any text
//    tag, else inferred if any inferred tag, else none.
//
// --apply also writes the tag list (labels + patterns) to condition_tags.
// Afterwards re-run 07 (copies conditions into bridged rows) and 08.
//
// Usage:
//   node scripts/etl/04_conditions.mjs            (dry-run, prints + writes report only)
//   node scripts/etl/04_conditions.mjs --apply    (writes to APP_DATABASE_URL)

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { makeTargeter } from './lib/fitment.mjs';
import { rowConditions, marketTag, CONFLICTS, TAG_PATTERNS, TAG_LABELS, MARKET_PATTERNS } from './lib/conditions.mjs';

const APPLY = process.argv.includes('--apply');

const source = new pg.Pool({ connectionString: process.env.SOURCE_DATABASE_URL });
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

const BATCH = 20000;

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const rows = (
    await source.query(`
      SELECT id, part_number, description, used_on_raw, year_start, year_end, source_document_title AS doc
      FROM hd_oem_catalog_reference ORDER BY id
    `)
  ).rows;
  const fitmentSrc = (
    await source.query(`
      SELECT DISTINCT upper(trim(oem_part_no)) AS display, catalog_year_start AS year_start, catalog_year_end AS year_end
      FROM oem_fitment WHERE oem_part_no IS NOT NULL
    `)
  ).rows;
  const vehicles = (await app.query(`SELECT vehicle_id, year, model_code, platform FROM vehicles`)).rows;
  const parts = new Map((await app.query(`SELECT oem_number, description_clean FROM oem_parts`)).rows.map((r) => [r.oem_number, r.description_clean]));
  const loaded = new Set(
    (await app.query(`SELECT oem_number || '|' || vehicle_id AS k FROM fitment WHERE source = 'oem_catalog'`)).rows.map((r) => r.k)
  );

  const { target } = makeTargeter({ rows, fitmentSrc, vehicles, parts: new Set(parts.keys()) });

  // ---- 1-2: text tags per (part, vehicle) ----
  const acc = new Map(); // key -> { tags: Set, dom, cal, ids: [] }
  const rowTagCount = {};
  rows.forEach((r, i) => {
    const t = target(r, i);
    if (t.status !== 'ok') return;
    const c = rowConditions(r.description, r.used_on_raw);
    const mt = c.us ? marketTag(c.us) : null;
    for (const tag of [...c.tags, ...(mt ? [mt] : [])]) rowTagCount[tag] = (rowTagCount[tag] || 0) + 1;
    for (const [v] of t.targets) {
      const key = `${t.oem}|${v.vehicle_id}`;
      let e = acc.get(key);
      if (!e) acc.set(key, (e = { tags: new Set(), dom: false, cal: false, ids: [] }));
      for (const tag of c.tags) e.tags.add(tag);
      e.dom ||= c.us ? c.us.dom : true;
      e.cal ||= c.us ? c.us.cal : true;
      if (e.ids.length < 3) e.ids.push(r.id);
    }
  });

  // ---- 3: EFI/carb inference from X / XI siblings ----
  const covered = new Set();
  const fitsByVehicle = new Map(); // vehicle_id -> Set(oem)
  for (const key of acc.keys()) {
    const [oem, vid] = key.split('|');
    covered.add(Number(vid));
    if (!fitsByVehicle.has(Number(vid))) fitsByVehicle.set(Number(vid), new Set());
    fitsByVehicle.get(Number(vid)).add(oem);
  }
  const vAt = new Map(vehicles.map((v) => [`${v.model_code}|${v.year}`, v]));
  const inferred = new Map(); // key -> 'efi' | 'carb'
  const pairs = [];
  for (const v of vehicles) {
    if (!v.model_code.endsWith('I')) continue;
    const carbV = vAt.get(`${v.model_code.slice(0, -1)}|${v.year}`);
    if (!carbV || !covered.has(v.vehicle_id) || !covered.has(carbV.vehicle_id)) continue;
    pairs.push(`${carbV.model_code}/${v.model_code} ${v.year}`);
    const efiParts = fitsByVehicle.get(v.vehicle_id);
    const carbParts = fitsByVehicle.get(carbV.vehicle_id);
    for (const oem of efiParts) if (!carbParts.has(oem)) inferred.set(`${oem}|${v.vehicle_id}`, 'efi');
    for (const oem of carbParts) if (!efiParts.has(oem)) inferred.set(`${oem}|${carbV.vehicle_id}`, 'carb');
  }

  // ---- 4: final conditions ----
  const final = new Map(); // key -> { conditions, source }
  const review = [];
  const tagCount = {};
  const sourceCount = { catalog_text: 0, inferred: 0, none: 0 };
  for (const [key, e] of acc) {
    const text = new Set(e.tags);
    const mt = marketTag({ dom: e.dom, cal: e.cal });
    if (mt) text.add(mt);
    const inf = inferred.get(key);
    const all = new Set([...text, ...(inf ? [inf] : [])]);
    for (const [a, b] of CONFLICTS)
      if (all.has(a) && all.has(b)) {
        review.push({ key, conflict: `${a}+${b}`, ids: e.ids.join(' ') });
        all.delete(a); all.delete(b); text.delete(a); text.delete(b);
      }
    const conditions = [...all].sort();
    const src = [...text].some((t) => all.has(t)) ? 'catalog_text' : all.size ? 'inferred' : 'none';
    sourceCount[src]++;
    for (const t of conditions) tagCount[t] = (tagCount[t] || 0) + 1;
    final.set(key, { conditions, source: src });
  }
  const notLoaded = [...final.keys()].filter((k) => !loaded.has(k)).length;
  const missing = [...loaded].filter((k) => !final.has(k)).length;

  // ---- report ----
  const vById = new Map(vehicles.map((v) => [v.vehicle_id, v]));
  const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '-');
  const lines = [];
  lines.push(`04_conditions.mjs — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  lines.push(`(part, vehicle) keys targeted: ${acc.size}; loaded oem_catalog fitment rows: ${loaded.size}`);
  lines.push(`  keys not in fitment (03 not re-applied?): ${notLoaded}; fitment rows with no key: ${missing}`);
  lines.push('');
  lines.push('Catalog rows carrying each tag (before merging):');
  for (const [t, n] of Object.entries(rowTagCount).sort((a, b) => b[1] - a[1])) lines.push(`  ${t.padEnd(15)} ${n}`);
  lines.push('');
  lines.push(`X/XI sibling pairs used for inference: ${pairs.length} (e.g. ${pairs.slice(0, 6).join(', ')})`);
  lines.push(`  inferred efi: ${[...inferred.values()].filter((x) => x === 'efi').length}, carb: ${[...inferred.values()].filter((x) => x === 'carb').length}`);
  lines.push('');
  lines.push('Fitment rows by final tag:');
  for (const [t, n] of Object.entries(tagCount).sort((a, b) => b[1] - a[1])) lines.push(`  ${t.padEnd(15)} ${String(n).padStart(7)} (${pct(n, final.size)})`);
  lines.push(`condition_source: catalog_text ${sourceCount.catalog_text}, inferred ${sourceCount.inferred}, none ${sourceCount.none}`);
  lines.push(`Contradictions dropped: ${review.length}`);
  lines.push('');
  lines.push('Samples per tag (5 each): part, vehicle, source row ids');
  for (const tag of Object.keys(tagCount).sort()) {
    lines.push(`  [${tag}]`);
    const ks = [...final].filter(([, f]) => f.conditions.includes(tag)).map(([k]) => k);
    const step = Math.max(1, Math.floor(ks.length / 5));
    for (const k of ks.filter((_, i) => i % step === 0).slice(0, 5)) {
      const [oem, vid] = k.split('|');
      const v = vById.get(Number(vid));
      lines.push(`    ${oem.padEnd(12)} ${(parts.get(oem) ?? '').slice(0, 30).padEnd(31)} ${v.year} ${v.model_code.padEnd(8)} {${final.get(k).conditions.join(',')}} rows:${acc.get(k).ids.join(' ')}`);
    }
  }

  const ts = timestamp();
  const reportPath = path.join('reports', `04_conditions_${ts}.txt`);
  const reviewPath = path.join('reports', `04_conditions_review_${ts}.csv`);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n') + '\n');
  fs.writeFileSync(reviewPath, ['oem_number,vehicle_id,conflict,source_ids', ...review.map((r) => [...r.key.split('|'), r.conflict, r.ids].map(csvCell).join(','))].join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\nReport written to ${reportPath}`);
  console.log(`Review rows written to ${reviewPath}`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write to APP_DATABASE_URL.');
    return;
  }

  const client = await app.connect();
  try {
    await client.query('BEGIN');
    const pg = (ps) => ps.map((p) => p.replace(/\\b/g, '\\y'));
    const tagRows = Object.keys(TAG_LABELS).map((t) => [t, TAG_LABELS[t], pg(TAG_PATTERNS[t] ?? MARKET_PATTERNS[t])]);
    await client.query(
      `INSERT INTO condition_tags (tag, label, patterns)
       SELECT t, l, string_to_array(p, E'\\x1f') FROM unnest($1::text[], $2::text[], $3::text[]) AS x(t, l, p)
       ON CONFLICT (tag) DO UPDATE SET label = EXCLUDED.label, patterns = EXCLUDED.patterns`,
      [tagRows.map((r) => r[0]), tagRows.map((r) => r[1]), tagRows.map((r) => r[2].join('\x1f'))]
    );
    await client.query(`CREATE TEMP TABLE cond (o text, v int, c text[], s text) ON COMMIT DROP`);
    const entries = [...final];
    for (let i = 0; i < entries.length; i += BATCH) {
      const chunk = entries.slice(i, i + BATCH);
      await client.query(
        `INSERT INTO cond SELECT o, v, string_to_array(nullif(c, ''), ','), s
         FROM unnest($1::text[], $2::int[], $3::text[], $4::text[]) AS t(o, v, c, s)`,
        [
          chunk.map(([k]) => k.split('|')[0]),
          chunk.map(([k]) => Number(k.split('|')[1])),
          chunk.map(([, f]) => f.conditions.join(',')),
          chunk.map(([, f]) => f.source),
        ]
      );
    }
    const res = await client.query(
      `UPDATE fitment f SET conditions = coalesce(c.c, '{}'), condition_source = c.s
       FROM cond c WHERE f.source = 'oem_catalog' AND f.oem_number = c.o AND f.vehicle_id = c.v`
    );
    await client.query('COMMIT');
    console.log(`Updated ${res.rowCount} fitment rows.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    source.end();
    app.end();
  });
