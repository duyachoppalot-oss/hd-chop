// scripts/etl/03_fitment.mjs
//
// Populates `fitment` in APP_DATABASE_URL from hd_oem_catalog_reference
// (ETL_PLAN step 03). Part numbers resolve exactly as in 02 (lib/parts.mjs);
// used_on_raw parses with lib/usedon.mjs.
//
// Row targeting and confidence live in lib/fitment.mjs (shared with 04).
// Targets per row:
//   codes   each code (or its glued-ANV base) x the row's catalog years, or the
//           year written next to the code; only (code, year) pairs in `vehicles`
//   all     the document's scope: every code listed explicitly in >= 2
//           rows of the same document, x the row's years
//   family  "DYNA: 93*-ALL": every vehicle of that platform from 93 (open) or
//           only 93, within the row's years
//   range   "86 TO * - ALL MODELS": the explicit years (to = row end for "*"),
//           for the document's scope or the listed codes
//
// confidence: low if the number was repaired from another year's catalogs or
// the year is an "early/late YY" boundary; high if the number was read as-is
// and oem_fitment has it in a catalog covering that year; else medium (incl.
// repaired_same_year: one candidate in that year's catalogs). One row per (part, vehicle): best confidence, lowest
// source id. conditions stay '{}' (step 04).
//
// --apply replaces every fitment row with source = 'oem_catalog' and also clears
// the rows built on top of it (service_catalog from 09 merges against these
// pairs; inferred_span from 07 bridges their holes). Re-run 04 -> 09 -> 05 ->
// 06 -> 07 and refresh fitment_spans afterwards.
//
// --vehicles-from reports/01_vehicles_<ts>.json (dry-run only): target 01's
// proposed vehicles as well as the ones in the DB, and report what the new ones
// would get, before 01 is applied.
//
// Usage:
//   node scripts/etl/03_fitment.mjs            (dry-run, prints + writes report only)
//   node scripts/etl/03_fitment.mjs --vehicles-from reports/01_vehicles_<ts>.json
//   node scripts/etl/03_fitment.mjs --apply    (writes to APP_DATABASE_URL)

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { makeTargeter } from './lib/fitment.mjs';

const APPLY = process.argv.includes('--apply');
const vfArg = process.argv.indexOf('--vehicles-from');
const VEHICLES_FROM = vfArg > -1 ? process.argv[vfArg + 1] : null;
if (APPLY && VEHICLES_FROM) {
  console.error('--vehicles-from is a dry-run preview; apply 01 first, then run 03 --apply without it.');
  process.exit(1);
}

const source = new pg.Pool({ connectionString: process.env.SOURCE_DATABASE_URL });
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

const CONF_RANK = { high: 0, medium: 1, low: 2 };
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
  // Preview: add 01's proposed vehicles that aren't in the DB yet, with negative ids.
  const proposed = new Map(); // vehicle_id -> proposed vehicle
  if (VEHICLES_FROM) {
    const have = new Set(vehicles.map((v) => `${v.year}|${v.model_code}`));
    let id = -1;
    for (const v of JSON.parse(fs.readFileSync(VEHICLES_FROM, 'utf8'))) {
      if (have.has(`${v.year}|${v.model_code}`)) continue;
      const nv = { vehicle_id: id--, year: v.year, model_code: v.model_code, platform: v.platform, model_name: v.model_name };
      vehicles.push(nv);
      proposed.set(nv.vehicle_id, nv);
    }
  }
  const parts = new Set((await app.query(`SELECT oem_number FROM oem_parts`)).rows.map((r) => r.oem_number));

  const { target, confidence, parsed, docScope, byCode } = makeTargeter({ rows, fitmentSrc, vehicles, parts });

  const fit = new Map(); // `${oem}|${vehicle_id}` -> { conf, id, kind }
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
    const t = target(r, i);
    kindRows[t.kind] = (kindRows[t.kind] || 0) + 1;
    for (const c of t.missing) missingCodes.set(c, (missingCodes.get(c) || 0) + 1);
    for (const [reason, detail] of t.notes) addReview(reason, r, detail);
    if (t.status === 'part_unresolved') { stat.part_unresolved++; return; } // listed in the 02 review file
    if (t.status === 'part_not_loaded') { stat.part_not_loaded++; return; }
    if (t.status === 'bad_year') { stat.bad_year++; addReview('bad_year', r, t.reason); return; }
    if (t.status === 'unparsed') { addReview(`unparsed:${t.reason}`, r, (r.used_on_raw || '').slice(0, 60)); return; }
    if (t.status === 'no_vehicle') { stat.no_vehicle++; addReview(`no_vehicle:${t.kind}`, r, (r.used_on_raw || '').slice(0, 60)); return; }
    stat.with_fitment++;
    for (const [v, low] of t.targets) {
      const conf = confidence(t.oem, t.res, v, low);
      const key = `${t.oem}|${v.vehicle_id}`;
      const e = fit.get(key);
      if (!e) { fit.set(key, { conf, id: r.id, kind: t.kind }); kindFit[t.kind] = (kindFit[t.kind] || 0) + 1; }
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
  lines.push(`Document scope for ALL rows (codes listed in >= 2 rows of the doc):`);
  const allDocs = new Set(rows.filter((_, i) => parsed[i].kind === 'all' || (parsed[i].kind === 'range' && parsed[i].all)).map((r) => r.doc));
  for (const doc of [...allDocs].sort()) {
    const scope = docScope.get(doc) || [];
    const plats = {};
    for (const c of scope) for (const v of byCode.get(c).values()) { plats[v.platform] = 1; break; }
    lines.push(`  ${doc.slice(0, 45).padEnd(46)} ${String(scope.length).padStart(3)} codes  [${Object.keys(plats).join(',')}]  ${scope.slice(0, 12).join(' ')}${scope.length > 12 ? ' …' : ''}`);
  }
  if (VEHICLES_FROM) {
    lines.push('');
    lines.push(`Proposed vehicles from ${VEHICLES_FROM} not in the DB: ${proposed.size}`);
    const names = new Map(
      (await app.query(`SELECT p.oem_number, p.oem_display, p.description_clean, c.display_name FROM oem_parts p LEFT JOIN part_concepts c USING (concept_id)`)).rows.map((r) => [r.oem_number, r])
    );
    const byVehicle = new Map(); // vehicle_id -> [{oem, conf}]
    for (const [key, e] of fit) {
      const vid = Number(key.split('|')[1]);
      if (!proposed.has(vid)) continue;
      if (!byVehicle.has(vid)) byVehicle.set(vid, []);
      byVehicle.get(vid).push({ oem: key.split('|')[0], conf: e.conf });
    }
    const models = new Map();
    for (const v of proposed.values()) {
      if (!models.has(v.model_code)) models.set(v.model_code, []);
      models.get(v.model_code).push(v);
    }
    for (const [code, vs] of [...models].sort()) {
      const per = vs.sort((a, b) => a.year - b.year).map((v) => `${v.year}:${(byVehicle.get(v.vehicle_id) || []).filter((x) => x.conf !== 'low').length}`);
      lines.push(`  ${code.padEnd(7)} ${String(vs[0].model_name ?? '(no name)').padEnd(28)} high+medium rows by year: ${per.join(' ')}`);
    }
    // One sample year per model: parts by concept.
    lines.push('  Parts by concept, one year per model (newest number shown, up to 3):');
    for (const [code, vs] of [...models].sort()) {
      const v = vs.find((x) => (byVehicle.get(x.vehicle_id) || []).length) ?? vs[0];
      const parts = (byVehicle.get(v.vehicle_id) || []).filter((x) => x.conf !== 'low').map((x) => names.get(x.oem)).filter((n) => n?.display_name);
      const byC = {};
      for (const n of parts) (byC[n.display_name] ||= []).push(n.oem_display);
      const cells = Object.entries(byC).sort().map(([c, xs]) => `${c}: ${xs.slice(0, 3).join(', ')}`);
      lines.push(`    ${v.year} ${code}: ${cells.length ? cells.slice(0, 14).join(' | ') : 'no concept parts'}${cells.length > 14 ? ` | +${cells.length - 14} more concepts` : ''}`);
    }
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
    const del = await client.query(`DELETE FROM fitment WHERE source IN ('oem_catalog', 'service_catalog', 'inferred_span')`);
    console.log(`Deleted ${del.rowCount} previous oem_catalog / service_catalog / inferred_span fitment rows.`);
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
    console.log('Next: 04_conditions --apply, 09_service_catalog --apply, 05, 06, 07 --max-hole 3, refresh fitment_spans.');
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
