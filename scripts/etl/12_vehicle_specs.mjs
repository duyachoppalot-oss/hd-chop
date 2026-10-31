// scripts/etl/12_vehicle_specs.mjs
//
// Engine displacement (ci/cc) and transmission speeds per vehicle, from
// documented H-D tables in scripts/catalog/specs/: the 99427-84 "Shovelhead Model
// History" (Shovel FL/FX/FXR 1966-84) and the 99484-69 Sportster service manual
// specifications (XLH/XLCH 1959-69, also horsepower and compression ratio).
// Evolution era 1984-90 from H-D parts catalogs: the 1987-90 All 1340cc Models book
// (VIN table + fifth gears on ALL), the 99545-90 police book (FXRP/FLHTP), the
// 1984-86 FLT / FXR / FX-FXST books (transmission only, they print no size) and the
// 1986-90 XLH book (883/1100/1200 cc VIN table). 1991+ is 15_portal_specs.
//
// A speeds-only row (ci null) is dropped where another source gives that bike a size
// with the same speeds.
//
// A spec row lands on a vehicle only when the (code, year) exists in `vehicles`;
// the table never creates vehicles. Where two printed rows give the same code
// different displacements in one year (FLH 1978-80: 74 and 80 ci sold side by
// side; FXE 1981-84; "1/2" years), the vehicle gets both, as options.
//
// Also reports where the table and `vehicles` disagree on a model's years (e.g.
// a code we carry past the table's last year), for review; vehicles are never changed.
//
// --apply writes vehicle_specs (migration 006): one row per option, replacing
// every row whose source is one of TABLES (other sources are left alone).
//
// Usage:
//   node scripts/etl/12_vehicle_specs.mjs          (dry run, writes reports/12_vehicle_specs_<ts>.txt + .csv)
//   node scripts/etl/12_vehicle_specs.mjs --apply  (writes vehicle_specs in APP_DATABASE_URL)

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import * as shovel from '../catalog/specs/shovelhead_model_history.mjs';
import * as ironhead from '../catalog/specs/ironhead_1959_69_service.mjs';
import * as evo1340 from '../catalog/specs/evo_1340_1987_90_catalog.mjs';
import * as police from '../catalog/specs/police_1984_90_catalog.mjs';
import * as evo8486 from '../catalog/specs/evo_bigtwin_1984_86_catalogs.mjs';
import * as evoXl from '../catalog/specs/evo_sportster_1986_90_catalog.mjs';

const APPLY = process.argv.includes('--apply');

const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const TABLES = [shovel, ironhead, evo1340, police, evo8486, evoXl];

const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const runs = (ys) => {
  ys = [...new Set(ys)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < ys.length; i++) {
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] === ys[j] + 1) j++;
    out.push(i === j ? `${ys[i]}` : `${ys[i]}-${ys[j]}`);
    i = j;
  }
  return out.join(', ') || '-';
};

async function main() {
  const vehicles = (await app.query('SELECT vehicle_id, year, model_code, model_name, platform, engine FROM vehicles')).rows;
  const byKey = new Map(vehicles.map((v) => [`${v.year}|${v.model_code}`, v]));

  const specs = new Map(); // vehicle_id -> { v, options: [{ci, cc, speeds, label, note, review}] }
  const unmatched = []; // table (code, year) with no vehicle
  const review = [];
  const tableYears = new Map(); // code -> years the table names

  for (const t of TABLES) {
    for (const r of t.ROWS) {
      if (!r.code) { review.push(`${r.label} ${r.from}-${r.to}: ${r.review}`); continue; }
      if (r.review) review.push(`${r.label} ${r.from}-${r.to}: ${r.review}`);
      for (let y = r.from; y <= r.to; y++) {
        if (!t.SOURCE.coverageOnly) (tableYears.get(r.code) ?? tableYears.set(r.code, []).get(r.code)).push(y);
        const v = byKey.get(`${y}|${r.code}`);
        if (!v) { unmatched.push({ code: r.code, year: y }); continue; }
        const s = specs.get(v.vehicle_id) ?? specs.set(v.vehicle_id, { v, options: [] }).get(v.vehicle_id);
        if (!s.options.some((o) => o.source === t.SOURCE.key && o.ci === r.ci && o.speeds === r.speeds))
          s.options.push({ ci: r.ci, cc: r.cc ?? t.CC[r.ci] ?? null, speeds: r.speeds, hp: r.hp, compression: r.compression, label: r.label, note: r.note, source: t.SOURCE.key, source_ref: `${r.label}, ${t.SOURCE.pages}`, half: r.half && ((r.half === 'from' && y === r.from) || (r.half === 'to' && y === r.to)) });
      }
    }
  }

  for (const s of specs.values())
    s.options = s.options.filter((o) => o.ci != null || !s.options.some((x) => x.ci != null && x.speeds === o.speeds));

  // Merge options per vehicle: displacement options and the speeds the rows state.
  const rows = [...specs.values()].sort((a, b) => a.v.model_code.localeCompare(b.v.model_code) || a.v.year - b.v.year).map(({ v, options }) => {
    const cis = [...new Set(options.map((o) => o.ci).filter((c) => c != null))].sort((a, b) => a - b);
    const ccs = [...new Set(options.map((o) => o.cc).filter((c) => c != null))].sort((a, b) => a - b);
    const speeds = [...new Set(options.map((o) => o.speeds).filter((s) => s != null))];
    return {
      vehicle_id: v.vehicle_id, year: v.year, model_code: v.model_code, platform: v.platform, engine: v.engine,
      displacement_ci: cis.join('/'), displacement_cc: ccs.join('/'),
      horsepower: [...new Set(options.map((o) => o.hp).filter(Boolean))].join(' / '),
      compression: [...new Set(options.map((o) => o.compression).filter(Boolean))].join(' / '),
      transmission_speeds: speeds.length === 1 ? speeds[0] : speeds.length ? speeds.join('/') : '',
      flags: [cis.length > 1 ? 'two_displacements' : '', speeds.length > 1 ? 'two_transmissions' : '', speeds.length ? '' : 'no_transmission_stated', cis.length ? '' : 'no_size_stated', options.some((o) => o.half) ? 'mid_year_change' : ''].filter(Boolean).join(' '),
      rows: options.map((o) => o.label).join(' + '),
      source: [...new Set(options.map((o) => o.source))].join(' '),
    };
  });

  // Year disagreements between the table and vehicles (only codes the table covers, 1966-86).
  const disagree = [];
  for (const [code, ys] of tableYears) {
    const have = vehicles.filter((v) => v.model_code === code && v.year >= 1959 && v.year <= 1984).map((v) => v.year);
    const tableSet = new Set(ys);
    const extra = have.filter((y) => !tableSet.has(y));
    const missing = [...tableSet].filter((y) => !have.includes(y));
    if (extra.length || missing.length) disagree.push(`  ${code.padEnd(6)} table ${runs(ys).padEnd(12)} vehicles ${runs(have).padEnd(14)} | we have, table doesn't: ${runs(extra).padEnd(12)} | table has, we don't: ${runs(missing)}`);
  }

  const L = [];
  // vehicle_specs rows (one per option) vs what's in the table now.
  const specRows = [...specs.values()].flatMap(({ v, options }) =>
    options.map((o) => ({ vehicle_id: v.vehicle_id, ci: o.ci, cc: o.cc, speeds: o.speeds ?? null, hp: o.hp ?? null, compression: o.compression ?? null, half: !!o.half, note: o.note || null, source: o.source, source_ref: o.source_ref }))
  );
  const sourceKeys = TABLES.map((t) => t.SOURCE.key);
  const tableExists = (await app.query(`SELECT to_regclass('vehicle_specs') IS NOT NULL AS ok`)).rows[0].ok;
  const existing = tableExists ? (await app.query(`SELECT source, count(*)::int n FROM vehicle_specs GROUP BY 1`)).rows : [];
  if (APPLY && !tableExists) throw new Error('vehicle_specs is missing: apply packages/db/migrations/006_vehicle_specs.sql first.');

  L.push(`12_vehicle_specs — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  L.push(`vehicle_specs: ${tableExists ? `exists, ${existing.reduce((n, r) => n + r.n, 0)} rows (${existing.map((r) => `${r.source} ${r.n}`).join(', ') || 'empty'})` : 'table not created yet (migration 006)'}`);
  L.push(`Rows to write: ${specRows.length} (replacing ${existing.filter((r) => sourceKeys.includes(r.source)).reduce((n, r) => n + r.n, 0)} from the same sources)`);
  for (const t of TABLES) L.push(`Source: ${t.SOURCE.title}, ${t.SOURCE.pages} (${t.ROWS.length} printed rows)`);
  L.push(`Vehicles that would get specs: ${rows.length}`);
  L.push(`  with transmission: ${rows.filter((r) => r.transmission_speeds !== '').length} (4-speed ${rows.filter((r) => r.transmission_speeds === 4).length}, 5-speed ${rows.filter((r) => r.transmission_speeds === 5).length})`);
  L.push(`  two displacements offered that year: ${rows.filter((r) => r.flags.includes('two_displacements')).length}`);
  L.push(`Table (code, year) with no vehicle: ${unmatched.length}`);
  const um = {};
  for (const u of unmatched) (um[u.code] ||= []).push(u.year);
  for (const [c, ys] of Object.entries(um).sort()) L.push(`  ${c.padEnd(6)} ${runs(ys)}`);
  L.push('');
  L.push('Table vs vehicles years (review; not changed):');
  L.push(...(disagree.length ? disagree.sort() : ['  none']));
  L.push('');
  L.push('Rows needing review:');
  L.push(...review.map((s) => `  ${s}`));
  L.push('');
  L.push('Proposed specs:');
  for (const r of rows) L.push(`  ${r.year} ${r.model_code.padEnd(6)} ${r.platform}/${r.engine ?? '-'}  ${(r.displacement_ci + ' ci').padEnd(9)} ${(r.displacement_cc + ' cc').padEnd(11)} ${r.transmission_speeds ? r.transmission_speeds + '-speed' : 'trans ?'}  ${[r.horsepower, r.compression].filter(Boolean).join(', ')}  ${r.flags}`);

  fs.mkdirSync('reports', { recursive: true });
  const rp = path.join('reports', `12_vehicle_specs_${ts}.txt`);
  const cp = path.join('reports', `12_vehicle_specs_${ts}.csv`);
  fs.writeFileSync(rp, L.join('\n') + '\n');
  const cols = ['vehicle_id', 'year', 'model_code', 'platform', 'engine', 'displacement_ci', 'displacement_cc', 'transmission_speeds', 'horsepower', 'compression', 'flags', 'rows', 'source'];
  fs.writeFileSync(cp, [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');
  console.log(L.join('\n'));
  console.log(`\n→ ${rp} (+ .csv).`);
  if (!APPLY) { console.log('Dry run: nothing written. Re-run with --apply to write vehicle_specs.'); return; }

  const client = await app.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query('DELETE FROM vehicle_specs WHERE source = ANY($1)', [sourceKeys]);
    const ins = await client.query(
      `INSERT INTO vehicle_specs (vehicle_id, displacement_ci, displacement_cc, transmission_speeds, horsepower, compression_ratio, mid_year_change, note, source, source_ref)
       SELECT * FROM unnest($1::int[], $2::numeric[], $3::smallint[], $4::smallint[], $5::text[], $6::text[], $7::boolean[], $8::text[], $9::text[], $10::text[])`,
      ['vehicle_id', 'ci', 'cc', 'speeds', 'hp', 'compression', 'half', 'note', 'source', 'source_ref'].map((k) => specRows.map((r) => r[k]))
    );
    await client.query('COMMIT');
    console.log(`Deleted ${del.rowCount}, inserted ${ins.rowCount} vehicle_specs rows.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => app.end());
