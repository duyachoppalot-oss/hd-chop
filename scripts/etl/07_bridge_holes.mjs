// scripts/etl/07_bridge_holes.mjs
//
// Fills year holes inside fitment spans (Phase 1 gate finding, 2026-10-23).
// For each (part, model, conditions) listed in high/medium catalog fitment
// (oem_catalog or service_catalog), a hole is
// the run of missing years between two listed years. The hole is bridged only
// when, for every year in it:
//   - the vehicle (model, year) exists, and
//   - no catalog covers that vehicle at all (it has no oem_catalog or
//     service_catalog fitment of any part, any confidence).
// If any catalog covers the model in a hole year, the part may really have
// changed, so the hole stays.
//
// Bridged rows: source = 'inferred_span', confidence = medium (never high:
// no catalog lists them), conditions + condition_source copied from the left
// neighbour, source_ref names both neighbouring catalog rows. Runs after 03/04/09; --apply replaces all
// inferred_span rows. Refresh fitment_spans afterwards (08).
//
// Usage:
//   node scripts/etl/07_bridge_holes.mjs            (dry-run, prints + writes report only)
//   node scripts/etl/07_bridge_holes.mjs --apply    (writes to APP_DATABASE_URL)
//   add --max-hole N to cap the hole length

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
// --max-hole N: only bridge holes of at most N years. Long uncovered runs are
// often vehicle rows the year master pads (FXDC 1997-2004, FLST 1997-2005),
// not missing catalogs. Default: no cap.
const maxArg = process.argv.indexOf('--max-hole');
const MAX_HOLE = maxArg > -1 ? Number(process.argv[maxArg + 1]) : Infinity;

const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

const BATCH = 20000;

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
}

async function main() {
  const vehicles = (await app.query(`SELECT vehicle_id, year, model_code FROM vehicles`)).rows;
  const vehicleAt = new Map(vehicles.map((v) => [`${v.model_code}|${v.year}`, v.vehicle_id]));
  const covered = new Set(
    (await app.query(`SELECT DISTINCT vehicle_id FROM fitment WHERE source IN ('oem_catalog', 'service_catalog')`)).rows.map((r) => r.vehicle_id)
  );
  const rows = (
    await app.query(`
      SELECT f.oem_number, v.model_code, v.year, f.conditions, f.condition_source, f.source_ref
      FROM fitment f JOIN vehicles v USING (vehicle_id)
      WHERE f.source IN ('oem_catalog', 'service_catalog') AND f.confidence IN ('high','medium')
    `)
  ).rows;

  // (part, model, conditions) -> Map(year -> row)
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.oem_number}|${r.model_code}|${r.conditions.join(',')}`;
    if (!groups.has(k)) groups.set(k, new Map());
    groups.get(k).set(r.year, r);
  }

  const out = [];
  const holes = { total: 0, bridged: 0, covered_year: 0, no_vehicle_year: 0, too_long: 0 };
  const lenAll = {};
  const lenBridged = {};
  let spansBefore = 0;
  let spansAfter = 0;
  const examples = [];

  for (const [k, byYear] of groups) {
    const years = [...byYear.keys()].sort((a, b) => a - b);
    spansBefore++;
    spansAfter++;
    for (let i = 1; i < years.length; i++) {
      const gap = years[i] - years[i - 1] - 1;
      if (gap === 0) continue;
      spansBefore++;
      holes.total++;
      lenAll[gap] = (lenAll[gap] || 0) + 1;
      const [oem, model] = k.split('|');
      const holeYears = Array.from({ length: gap }, (_, j) => years[i - 1] + 1 + j);
      const vids = holeYears.map((y) => vehicleAt.get(`${model}|${y}`));
      if (vids.some((v) => v == null)) { holes.no_vehicle_year++; spansAfter++; continue; }
      if (vids.some((v) => covered.has(v))) { holes.covered_year++; spansAfter++; continue; }
      if (gap > MAX_HOLE) { holes.too_long++; spansAfter++; continue; }
      holes.bridged++;
      lenBridged[gap] = (lenBridged[gap] || 0) + 1;
      const left = byYear.get(years[i - 1]);
      const right = byYear.get(years[i]);
      for (const vid of vids)
        out.push({
          oem_number: oem,
          vehicle_id: vid,
          conditions: left.conditions,
          condition_source: left.condition_source,
          source_ref: `bridge:${left.source_ref}|${right.source_ref}`,
        });
      if (examples.length < 400) examples.push(`${oem} ${model} ${years[i - 1]} [${holeYears.join(',')}] ${years[i]}`);
    }
  }

  const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '-');
  const lines = [];
  lines.push(`07_bridge_holes.mjs — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  lines.push(`high/medium catalog fitment rows (oem_catalog + service_catalog): ${rows.length}`);
  lines.push(`(part, model, conditions) groups: ${groups.size}`);
  lines.push(`Vehicles covered by any catalog: ${covered.size} of ${vehicles.length}`);
  lines.push('');
  lines.push(`Holes: ${holes.total}`);
  lines.push(`  bridged: ${holes.bridged} (${pct(holes.bridged, holes.total)})`);
  lines.push(`  kept, a catalog covers the model in a hole year: ${holes.covered_year}`);
  lines.push(`  kept, model not produced (no vehicle) in a hole year: ${holes.no_vehicle_year}`);
  lines.push(`  kept, longer than --max-hole ${MAX_HOLE}: ${holes.too_long}`);
  lines.push(`Rows to add (source = inferred_span, medium): ${out.length}`);
  lines.push(`Spans (part x model x conditions runs): ${spansBefore} -> ${spansAfter}`);
  lines.push('');
  lines.push('Hole length (years): all holes / bridged holes / rows added');
  for (const n of Object.keys(lenAll).map(Number).sort((a, b) => a - b).slice(0, 15))
    lines.push(`  ${String(n).padStart(2)}: ${String(lenAll[n]).padStart(6)} / ${String(lenBridged[n] || 0).padStart(6)} / ${String((lenBridged[n] || 0) * n).padStart(6)}`);
  lines.push('');
  lines.push('Bridged by model (top 25, holes):');
  const byModel = {};
  for (const e of out) byModel[e.vehicle_id] = (byModel[e.vehicle_id] || 0) + 1;
  const vById = new Map(vehicles.map((v) => [v.vehicle_id, v]));
  const modelYears = {};
  for (const [vid, n] of Object.entries(byModel)) {
    const v = vById.get(Number(vid));
    (modelYears[v.model_code] ||= { rows: 0, years: new Set() }).rows += n;
    modelYears[v.model_code].years.add(v.year);
  }
  for (const [m, e] of Object.entries(modelYears).sort((a, b) => b[1].rows - a[1].rows).slice(0, 25))
    lines.push(`  ${m.padEnd(9)} rows=${String(e.rows).padStart(6)}  years filled: ${[...e.years].sort().join(', ')}`);
  lines.push('');
  lines.push('Sample (20 bridged holes, evenly spaced): part model left [filled] right');
  const step = Math.max(1, Math.floor(examples.length / 20));
  for (const e of examples.filter((_, i) => i % step === 0).slice(0, 20)) lines.push(`  ${e}`);

  const reportPath = path.join('reports', `07_bridge_holes_${timestamp()}.txt`);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\nReport written to ${reportPath}`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write to APP_DATABASE_URL.');
    return;
  }

  const client = await app.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query(`DELETE FROM fitment WHERE source = 'inferred_span'`);
    console.log(`Deleted ${del.rowCount} previous inferred_span rows.`);
    let inserted = 0;
    for (let i = 0; i < out.length; i += BATCH) {
      const chunk = out.slice(i, i + BATCH);
      const res = await client.query(
        `INSERT INTO fitment (oem_number, vehicle_id, conditions, condition_source, source, source_ref, confidence)
         SELECT o, v, coalesce(string_to_array(nullif(c, ''), ','), '{}'), cs, 'inferred_span', r, 'medium'
         FROM unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::text[]) AS t(o, v, c, cs, r)
         ON CONFLICT DO NOTHING`,
        [
          chunk.map((e) => e.oem_number),
          chunk.map((e) => e.vehicle_id),
          chunk.map((e) => e.conditions.join(',')),
          chunk.map((e) => e.condition_source),
          chunk.map((e) => e.source_ref),
        ]
      );
      inserted += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`Inserted ${inserted} inferred_span rows.`);
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
  .finally(() => app.end());
