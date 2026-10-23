// scripts/etl/03_fitment.mjs
//
// Populates `fitment` in APP_DATABASE_URL from hd_oem_catalog_reference
// (ETL_PLAN step 03). Part numbers resolve exactly as in 02 (lib/parts.mjs);
// used_on_raw parses with lib/usedon.mjs.
//
// Targets per row:
//   codes   each code (or its glued-ANV base) x the row's catalog years, or the
//           year written next to the code; only (code, year) pairs in `vehicles`
//   all     the document's scope: every code listed explicitly in >= DOC_SCOPE_MIN
//           rows of the same document, x the row's years
//   family  "DYNA: 93*-ALL": every vehicle of that platform from 93 (open) or
//           only 93, within the row's years
//   range   "86 TO * - ALL MODELS": the explicit years (to = row end for "*"),
//           for the document's scope or the listed codes
//
// confidence: low if the number was repaired or the year is an "early/late YY"
// boundary; high if oem_fitment has the same number in a catalog covering that
// year; else medium. One row per (part, vehicle): best confidence, lowest
// source id. conditions stay '{}' (step 04).
//
// --apply replaces every fitment row with source = 'oem_catalog'. Re-run 04
// afterwards.
//
// Usage:
//   node scripts/etl/03_fitment.mjs            (dry-run, prints + writes report only)
//   node scripts/etl/03_fitment.mjs --apply    (writes to APP_DATABASE_URL)

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { makeResolver, normalize, yearsOk } from './lib/parts.mjs';
import { parseUsedOn } from './lib/usedon.mjs';

const APPLY = process.argv.includes('--apply');

const source = new pg.Pool({ connectionString: process.env.SOURCE_DATABASE_URL });
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

const DOC_SCOPE_MIN = 2;
const CONF_RANK = { high: 0, medium: 1, low: 2 };
const BATCH = 20000;

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const span = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

async function main() {
  const rows = (
    await source.query(`
      SELECT id, part_number, used_on_raw, year_start, year_end, source_document_title AS doc
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
  const parts = new Set((await app.query(`SELECT oem_number FROM oem_parts`)).rows.map((r) => r.oem_number));

  const { resolve } = makeResolver(rows, fitmentSrc);

  // oem_fitment number+year, for "high" confidence.
  const corroborated = new Set();
  for (const r of fitmentSrc) {
    if (!yearsOk(r) || (r.year_end ?? r.year_start) - r.year_start > 15) continue;
    const key = normalize(resolve({ part_number: r.display, year_start: r.year_start, year_end: r.year_end }).final ?? r.display);
    for (const y of span(r.year_start, r.year_end ?? r.year_start)) corroborated.add(`${key}|${y}`);
  }

  const byCode = new Map(); // code -> Map(year -> vehicle)
  const byPlatform = new Map(); // platform -> vehicles
  for (const v of vehicles) {
    if (!byCode.has(v.model_code)) byCode.set(v.model_code, new Map());
    byCode.get(v.model_code).set(v.year, v);
    if (!byPlatform.has(v.platform)) byPlatform.set(v.platform, []);
    byPlatform.get(v.platform).push(v);
  }
  const codeOf = (item) => item.alts.find((c) => byCode.has(c)) ?? null;

  // ---- pass 1: parse + document scope ----
  const parsed = rows.map((r) => parseUsedOn(r.used_on_raw));
  const docCodeRows = new Map(); // doc -> Map(code -> rows)
  rows.forEach((r, i) => {
    const p = parsed[i];
    if (!p.items) return;
    let m = docCodeRows.get(r.doc);
    if (!m) docCodeRows.set(r.doc, (m = new Map()));
    for (const c of new Set(p.items.map(codeOf).filter(Boolean))) m.set(c, (m.get(c) || 0) + 1);
  });
  const docScope = new Map();
  for (const [doc, m] of docCodeRows) docScope.set(doc, [...m].filter(([, n]) => n >= DOC_SCOPE_MIN).map(([c]) => c));

  // ---- pass 2: rows -> fitment ----
  const fit = new Map(); // `${oem}|${vehicle_id}` -> { conf, id }
  const stat = { rows: rows.length, part_unresolved: 0, part_not_loaded: 0, bad_year: 0, no_vehicle: 0, with_fitment: 0 };
  const kindRows = {};
  const kindFit = {};
  const review = new Map();
  const missingCodes = new Map(); // code -> rows
  const addReview = (reason, r, detail) => {
    const k = `${reason}|${r.doc}|${detail}`;
    const e = review.get(k);
    if (e) { e.rows++; if (e.example_ids.length < 3) e.example_ids.push(r.id); return; }
    review.set(k, { reason, doc: r.doc, detail, rows: 1, example_ids: [r.id] });
  };

  rows.forEach((r, i) => {
    const p = parsed[i];
    kindRows[p.kind] = (kindRows[p.kind] || 0) + 1;
    const res = resolve(r);
    if (!res.final) { stat.part_unresolved++; return; } // listed in the 02 review file
    const oem = normalize(res.final);
    if (!parts.has(oem)) { stat.part_not_loaded++; return; }
    if (!yearsOk(r)) { stat.bad_year++; addReview('bad_year', r, `${r.year_start}-${r.year_end}`); return; }
    if (p.kind === 'unparsed') { addReview(`unparsed:${p.reason}`, r, (r.used_on_raw || '').slice(0, 60)); return; }

    const ys = r.year_start;
    const ye = r.year_end ?? r.year_start;
    const targets = []; // [vehicle, lowBoundary]
    const fromCodes = (items, years) => {
      for (const item of items) {
        const code = codeOf(item);
        if (!code) { missingCodes.set(item.code, (missingCodes.get(item.code) || 0) + 1); continue; }
        for (const y of item.year ? [item.year] : years) {
          const v = byCode.get(code).get(y);
          if (v) targets.push([v, false]);
        }
      }
    };
    const fromScope = (years) => {
      const scope = docScope.get(r.doc) || [];
      if (!scope.length) { addReview('all_without_doc_scope', r, ''); return; }
      for (const c of scope) for (const y of years) { const v = byCode.get(c).get(y); if (v) targets.push([v, false]); }
    };

    if (p.kind === 'codes') {
      fromCodes(p.items, span(ys, ye));
      if (p.bad.length) addReview('bad_code_token', r, p.bad.join(' | ').slice(0, 60));
    } else if (p.kind === 'all') {
      fromScope(span(ys, ye));
    } else if (p.kind === 'family') {
      const years = new Set(p.open ? span(Math.max(p.from, ys), ye) : [p.from]);
      for (const v of byPlatform.get(p.platform) || []) if (years.has(v.year)) targets.push([v, false]);
    } else if (p.kind === 'range') {
      const years = span(p.from, p.to ?? ye);
      const before = targets.length;
      if (p.all) fromScope(years);
      else fromCodes(p.items, years);
      for (let k = before; k < targets.length; k++) targets[k][1] = p.lowYears.includes(targets[k][0].year);
    }

    if (!targets.length) { stat.no_vehicle++; addReview(`no_vehicle:${p.kind}`, r, (r.used_on_raw || '').slice(0, 60)); return; }
    stat.with_fitment++;
    for (const [v, low] of targets) {
      const conf =
        res.numberSource !== 'extracted' || low ? 'low' : corroborated.has(`${oem}|${v.year}`) ? 'high' : 'medium';
      const key = `${oem}|${v.vehicle_id}`;
      const e = fit.get(key);
      if (!e) { fit.set(key, { conf, id: r.id, kind: p.kind }); kindFit[p.kind] = (kindFit[p.kind] || 0) + 1; }
      else {
        if (CONF_RANK[conf] < CONF_RANK[e.conf]) e.conf = conf;
        if (r.id < e.id) e.id = r.id;
      }
    }
  });

  // ---- report ----
  const vById = new Map(vehicles.map((v) => [v.vehicle_id, v]));
  const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '-');
  const confCount = { high: 0, medium: 0, low: 0 };
  const platCount = {};
  const partsWithFit = new Set();
  const vehiclesWithFit = new Set();
  for (const [key, e] of fit) {
    confCount[e.conf]++;
    const [oem, vid] = key.split('|');
    partsWithFit.add(oem);
    vehiclesWithFit.add(vid);
    const pl = vById.get(Number(vid)).platform;
    platCount[pl] = (platCount[pl] || 0) + 1;
  }

  const lines = [];
  lines.push(`03_fitment.mjs — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  lines.push(`Source rows (hd_oem_catalog_reference): ${stat.rows}`);
  lines.push(`  part number unresolved (see 02 review): ${stat.part_unresolved}`);
  lines.push(`  part not in oem_parts: ${stat.part_not_loaded}`);
  lines.push(`  bad catalog year: ${stat.bad_year}`);
  lines.push(`  parsed but no matching vehicle: ${stat.no_vehicle}`);
  lines.push(`  rows producing fitment: ${stat.with_fitment} (${pct(stat.with_fitment, stat.rows)})`);
  lines.push('');
  lines.push('used_on_raw kind (rows / new fitment rows first produced by that kind):');
  for (const [k, n] of Object.entries(kindRows).sort((a, b) => b[1] - a[1])) lines.push(`  ${k.padEnd(9)} ${String(n).padStart(7)}  ${String(kindFit[k] || 0).padStart(8)}`);
  lines.push('');
  lines.push(`Fitment rows: ${fit.size}`);
  for (const c of ['high', 'medium', 'low']) lines.push(`  ${c}: ${confCount[c]} (${pct(confCount[c], fit.size)})`);
  lines.push(`Parts with fitment: ${partsWithFit.size} of ${parts.size} (${pct(partsWithFit.size, parts.size)})`);
  lines.push(`Vehicles with fitment: ${vehiclesWithFit.size} of ${vehicles.length} (${pct(vehiclesWithFit.size, vehicles.length)})`);
  lines.push('By platform:');
  for (const [k, n] of Object.entries(platCount).sort((a, b) => b[1] - a[1])) lines.push(`  ${k}: ${n}`);
  lines.push('Vehicles without fitment, by platform + decade:');
  const noFit = {};
  for (const v of vehicles)
    if (!vehiclesWithFit.has(String(v.vehicle_id))) {
      const k = `${v.platform} ${Math.floor(v.year / 10) * 10}s`;
      (noFit[k] ||= []).push(`${v.model_code} ${v.year}`);
    }
  for (const [k, xs] of Object.entries(noFit).sort((a, b) => b[1].length - a[1].length))
    lines.push(`  ${k.padEnd(22)} ${String(xs.length).padStart(4)}  ${xs.slice(0, 6).join(', ')}`);
  lines.push('');
  lines.push('Model codes in used_on_raw that are not in vehicles (top 30, rows):');
  for (const [c, n] of [...missingCodes].sort((a, b) => b[1] - a[1]).slice(0, 30)) lines.push(`  ${c}: ${n}`);
  lines.push('');
  const reviewRows = [...review.values()];
  const byReason = {};
  for (const r of reviewRows) byReason[r.reason] = (byReason[r.reason] || 0) + r.rows;
  lines.push(`Review rows: ${reviewRows.reduce((n, r) => n + r.rows, 0)}`);
  for (const [k, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) lines.push(`  ${k}: ${n}`);
  lines.push('');
  lines.push(`Document scope for ALL rows (codes listed in >= ${DOC_SCOPE_MIN} rows of the doc):`);
  const allDocs = new Set(rows.filter((_, i) => parsed[i].kind === 'all' || (parsed[i].kind === 'range' && parsed[i].all)).map((r) => r.doc));
  for (const doc of [...allDocs].sort()) {
    const scope = docScope.get(doc) || [];
    const plats = {};
    for (const c of scope) for (const v of byCode.get(c).values()) { plats[v.platform] = 1; break; }
    lines.push(`  ${doc.slice(0, 45).padEnd(46)} ${String(scope.length).padStart(3)} codes  [${Object.keys(plats).join(',')}]  ${scope.slice(0, 12).join(' ')}${scope.length > 12 ? ' …' : ''}`);
  }
  lines.push('');
  lines.push('Sample (20 fitment rows, evenly spaced):');
  const keys = [...fit.keys()].sort();
  const step = Math.max(1, Math.floor(keys.length / 20));
  for (const k of keys.filter((_, i) => i % step === 0).slice(0, 20)) {
    const e = fit.get(k);
    const [oem, vid] = k.split('|');
    const v = vById.get(Number(vid));
    lines.push(`  ${oem.padEnd(12)} ${v.year} ${v.model_code.padEnd(9)} ${v.platform.padEnd(9)} ${e.conf.padEnd(6)} via ${e.kind.padEnd(6)} ref:${e.id}`);
  }

  const ts = timestamp();
  const reportPath = path.join('reports', `03_fitment_${ts}.txt`);
  const reviewPath = path.join('reports', `03_fitment_review_${ts}.csv`);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n') + '\n');
  const cols = ['reason', 'doc', 'detail', 'rows', 'example_ids'];
  reviewRows.sort((a, b) => a.reason.localeCompare(b.reason) || b.rows - a.rows);
  fs.writeFileSync(
    reviewPath,
    [cols.join(','), ...reviewRows.map((r) => cols.map((c) => csvCell(c === 'example_ids' ? r[c].join(' ') : r[c])).join(','))].join('\n') + '\n'
  );
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
    const del = await client.query(`DELETE FROM fitment WHERE source = 'oem_catalog'`);
    console.log(`Deleted ${del.rowCount} previous oem_catalog fitment rows.`);
    const entries = [...fit];
    let inserted = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      const chunk = entries.slice(i, i + BATCH);
      const res = await client.query(
        `INSERT INTO fitment (oem_number, vehicle_id, conditions, condition_source, source, source_ref, confidence)
         SELECT o, v, '{}', 'none', 'oem_catalog', 'hd_oem_catalog_reference:' || r, c
         FROM unnest($1::text[], $2::int[], $3::int[], $4::text[]) AS t(o, v, r, c)`,
        [
          chunk.map(([k]) => k.split('|')[0]),
          chunk.map(([k]) => Number(k.split('|')[1])),
          chunk.map(([, e]) => e.id),
          chunk.map(([, e]) => e.conf),
        ]
      );
      inserted += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`Inserted ${inserted} fitment rows.`);
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
