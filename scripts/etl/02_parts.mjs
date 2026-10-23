// scripts/etl/02_parts.mjs
//
// Populates `oem_parts` in APP_DATABASE_URL from hd_oem_catalog_reference
// (ETL_PLAN step 02). Classification, repair and description cleaning live
// in lib/parts.mjs so 03_fitment resolves rows the same way.
//
// - Valid numbers (std NNNNN-YY[A], modern 8-digit, 4-5 digit hardware) are
//   kept as extracted.
// - Truncated "NNNNN-" / "NNNNN-D", OCR'd "NNNNN-YYD" and front-truncated
//   3-4 digit bases (unless oem_fitment confirms them) are repaired from the
//   full std numbers in both catalog tables: exactly one candidate seen in the
//   row's catalog years -> repaired_same_year; else exactly one anywhere ->
//   repaired_other_year; else review. A candidate's -YY intro year must not be
//   later than the row's catalog year.
// - Everything else (OCR noise, item numbers, fragments) goes to review.
// - description_clean: most common cleaned name across the number's rows. A
//   name whose first word heads fewer than MIN_HEAD_PARTS part numbers is
//   treated as OCR noise.
// - chain_root = self; concept_id null (set in 05 / 06).
//
// Usage:
//   node scripts/etl/02_parts.mjs            (dry-run, prints + writes report only)
//   node scripts/etl/02_parts.mjs --apply    (writes to APP_DATABASE_URL)

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { classify, normalize, buildDictionary, repair, cleanDescription } from './lib/parts.mjs';

const APPLY = process.argv.includes('--apply');

const source = new pg.Pool({ connectionString: process.env.SOURCE_DATABASE_URL });
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

const YEAR_MIN = 1903;
const YEAR_MAX = 2027;
const MIN_HEAD_PARTS = 3;
const SOURCE_RANK = { extracted: 0, repaired_same_year: 1, repaired_other_year: 2 };

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const validYear = (y) => y != null && y >= YEAR_MIN && y <= YEAR_MAX;

async function main() {
  const { rows } = await source.query(`
    SELECT id, part_number, description, year_start, year_end
    FROM hd_oem_catalog_reference
    ORDER BY id
  `);
  const fitment = (
    await source.query(`
      SELECT DISTINCT upper(trim(oem_part_no)) AS display, catalog_year_start AS year_start, catalog_year_end AS year_end
      FROM oem_fitment WHERE oem_part_no IS NOT NULL
    `)
  ).rows;

  const yearsOk = (r) => validYear(r.year_start) && validYear(r.year_end ?? r.year_start) && (r.year_end ?? r.year_start) >= r.year_start;
  const dict = buildDictionary([
    ...rows.filter(yearsOk).map((r) => ({ display: r.part_number, year_start: r.year_start, year_end: r.year_end })),
    ...fitment.filter(yearsOk),
  ]);
  const inFitment = new Set(fitment.map((r) => classify(r.display).display));

  // ---- resolve every reference row ----
  const classRows = {};
  const classNumbers = {};
  const classInFitment = {};
  const repairRows = {};
  const repairPairs = {};
  const review = new Map(); // reason|raw|years -> aggregated row
  const parts = new Map(); // oem_number -> { displays: Map, source, descs: Map, rows }
  let resolvedRows = 0;

  const addReview = (reason, r, display, candidates = []) => {
    const k = `${reason}|${r.part_number}|${r.year_start}|${r.year_end}`;
    const e = review.get(k);
    if (e) { e.rows++; return; }
    review.set(k, {
      reason, part_number: r.part_number, display, year_start: r.year_start, year_end: r.year_end, rows: 1,
      candidates: candidates.slice(0, 8).join(' '), description: (r.description || '').slice(0, 80),
    });
  };

  for (const r of rows) {
    const { cls, display } = classify(r.part_number);
    classRows[cls] = (classRows[cls] || 0) + 1;
    (classNumbers[cls] ||= new Set()).add(display);
    if (inFitment.has(display)) (classInFitment[cls] ||= new Set()).add(display);

    let final = null;
    let numberSource = null;
    if (cls === 'std' || cls === 'modern' || cls === 'hardware') {
      final = display;
      numberSource = 'extracted';
    } else if (cls === 'short_base' && inFitment.has(display)) {
      final = display;
      numberSource = 'extracted';
    } else if (cls === 'truncated' || cls === 'ocr_suffix' || cls === 'short_base') {
      if (!yearsOk(r)) { addReview('bad_year', r, display); continue; }
      const res = repair(dict, cls, display, r.year_start, r.year_end ?? r.year_start);
      repairRows[res.outcome] = (repairRows[res.outcome] || 0) + 1;
      (repairPairs[res.outcome] ||= new Set()).add(`${display}|${r.year_start}`);
      if (res.display) { final = res.display; numberSource = res.outcome; }
      else { addReview(res.outcome, r, display, res.candidates); continue; }
    } else {
      addReview('junk_format', r, display);
      continue;
    }

    resolvedRows++;
    const key = normalize(final);
    let p = parts.get(key);
    if (!p) parts.set(key, (p = { displays: new Map(), source: numberSource, descs: new Map(), rows: 0 }));
    p.rows++;
    p.displays.set(final, (p.displays.get(final) || 0) + 1);
    if (SOURCE_RANK[numberSource] < SOURCE_RANK[p.source]) p.source = numberSource;
    const d = cleanDescription(r.description);
    if (d) p.descs.set(d, (p.descs.get(d) || 0) + 1);
  }

  // ---- normalized collisions: keep the most common display ----
  const collisions = [];
  for (const [key, p] of parts) {
    if (p.displays.size < 2) continue;
    const [keep, ...drop] = [...p.displays.entries()].sort((a, b) => b[1] - a[1]);
    collisions.push(`${key}: kept ${keep[0]} (${keep[1]}), dropped ${drop.map(([d, n]) => `${d} (${n})`).join(', ')}`);
    for (const [d, n] of drop)
      review.set(`normalized_collision|${d}`, { reason: 'normalized_collision', part_number: d, display: d, rows: n, candidates: keep[0], description: '' });
    p.displays = new Map([keep]);
  }

  // ---- descriptions: drop names whose head word is rare (OCR noise), then take the mode ----
  const head = (d) => d.split(/[\s,]/)[0].toLowerCase();
  const headParts = new Map();
  for (const p of parts.values())
    for (const h of new Set([...p.descs.keys()].map(head))) headParts.set(h, (headParts.get(h) || 0) + 1);
  let noisyDropped = 0;
  const oemParts = [];
  for (const [key, p] of parts) {
    const ok = [...p.descs.entries()].filter(([d]) => (headParts.get(head(d)) || 0) >= MIN_HEAD_PARTS);
    if (ok.length < p.descs.size && ok.length === 0) noisyDropped++;
    ok.sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]));
    oemParts.push({
      oem_number: key,
      oem_display: [...p.displays.keys()][0],
      description_clean: ok.length ? ok[0][0] : null,
      number_source: p.source,
      rows: p.rows,
    });
  }
  oemParts.sort((a, b) => a.oem_number.localeCompare(b.oem_number));

  // ---- report ----
  const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '-');
  const lines = [];
  lines.push(`02_parts.mjs — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  lines.push(`Source rows (hd_oem_catalog_reference): ${rows.length}`);
  lines.push(`Repair dictionary: ${dict.years.size} full std numbers (reference + oem_fitment)`);
  lines.push('');
  lines.push('Part-number format (rows / distinct / distinct also in oem_fitment):');
  for (const cls of ['std', 'modern', 'hardware', 'short_base', 'truncated', 'ocr_suffix', 'junk']) {
    const d = classNumbers[cls]?.size || 0;
    const f = classInFitment[cls]?.size || 0;
    lines.push(`  ${cls.padEnd(11)} ${String(classRows[cls] || 0).padStart(7)}  ${String(d).padStart(6)}  ${String(f).padStart(6)} (${pct(f, d)})`);
  }
  lines.push('');
  lines.push('Repair outcome (rows / distinct (number, year) pairs):');
  for (const o of ['repaired_same_year', 'repaired_other_year', 'ambiguous_same_year', 'ambiguous_other_year', 'no_candidate'])
    lines.push(`  ${o.padEnd(21)} ${String(repairRows[o] || 0).padStart(6)}  ${String(repairPairs[o]?.size || 0).padStart(6)}`);
  lines.push('');
  lines.push(`Reference rows resolved to a part number: ${resolvedRows} (${pct(resolvedRows, rows.length)})`);
  lines.push(`oem_parts rows: ${oemParts.length}`);
  for (const s of Object.keys(SOURCE_RANK))
    lines.push(`  ${s}: ${oemParts.filter((p) => p.number_source === s).length}`);
  const noDesc = oemParts.filter((p) => !p.description_clean).length;
  lines.push(`description_clean null: ${noDesc} (${pct(noDesc, oemParts.length)}); of those, only OCR-noise names: ${noisyDropped}`);
  lines.push(`Normalized collisions: ${collisions.length}`);
  lines.push(...collisions.slice(0, 15).map((c) => `  ${c}`));
  const reviewRows = [...review.values()];
  const byReason = {};
  for (const r of reviewRows) byReason[r.reason] = (byReason[r.reason] || 0) + r.rows;
  lines.push('');
  lines.push(`Review (rows not resolved): ${reviewRows.reduce((n, r) => n + r.rows, 0)}`);
  for (const [k, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) lines.push(`  ${k}: ${n}`);
  lines.push('');
  lines.push('Sample (20 parts, evenly spaced):');
  const step = Math.max(1, Math.floor(oemParts.length / 20));
  for (const p of oemParts.filter((_, i) => i % step === 0).slice(0, 20))
    lines.push(`  ${p.oem_display.padEnd(13)} ${p.oem_number.padEnd(12)} ${p.number_source.padEnd(19)} rows=${String(p.rows).padEnd(4)} ${p.description_clean ?? 'NULL'}`);
  lines.push('');
  lines.push('Sample repairs (10):');
  const repaired = oemParts.filter((p) => p.number_source !== 'extracted');
  const rstep = Math.max(1, Math.floor(repaired.length / 10));
  for (const p of repaired.filter((_, i) => i % rstep === 0).slice(0, 10))
    lines.push(`  ${p.oem_display.padEnd(13)} ${p.number_source.padEnd(19)} ${p.description_clean ?? 'NULL'}`);

  const ts = timestamp();
  const reportPath = path.join('reports', `02_parts_${ts}.txt`);
  const reviewPath = path.join('reports', `02_parts_review_${ts}.csv`);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n') + '\n');
  const cols = ['reason', 'part_number', 'display', 'year_start', 'year_end', 'rows', 'candidates', 'description'];
  reviewRows.sort((a, b) => a.reason.localeCompare(b.reason) || b.rows - a.rows);
  fs.writeFileSync(reviewPath, [cols.join(','), ...reviewRows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');
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
    const res = await client.query(
      `INSERT INTO oem_parts (oem_number, oem_display, description_clean, chain_root, number_source)
       SELECT n, d, c, n, s FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS t(n, d, c, s)
       ON CONFLICT (oem_number) DO UPDATE
         SET oem_display = EXCLUDED.oem_display, description_clean = EXCLUDED.description_clean,
             number_source = EXCLUDED.number_source`,
      [
        oemParts.map((p) => p.oem_number),
        oemParts.map((p) => p.oem_display),
        oemParts.map((p) => p.description_clean),
        oemParts.map((p) => p.number_source),
      ]
    );
    await client.query('COMMIT');
    console.log(`Upserted ${res.rowCount} oem_parts.`);
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
