// scripts/etl/16_chassis_specs.mjs
//
// Chassis sizes per vehicle from documented tables in scripts/catalog/specs/chassis/:
//   hd_tire_guide_2020.mjs  H-D 2020 Tire Fitment Guide, Stock rows: wheel (rim diameter x
//                           width) and tire size, front and rear, 1981-2020 (rank 1).
//   vtwin_axle_fork.mjs     V-Twin catalog size facts: front axle and fork tube diameter
//                           (rank 2; DATA_RIGHTS "V-Twin Mfg catalog" row).
// A row lands only where the (code, year) is already a vehicle; vehicles never change.
// Rank-2 rows are dropped where a rank-1 row covers the same bike + item + position.
// V-Twin family tokens (FLT, FXST, FXD, XL ...) go through lib/vendorterms.mjs; a model
// token beats a family token for the same bike + item; in the tire guide a named code
// beats a group row ("'14-'19 Touring (except ...)", "'03-'05 Softail").
//
// Several values for one bike + item are kept (stock variants: blackwall / whitewall
// tire, 74/80-style options); different wheel diameters or axle/fork sizes for one bike
// are listed for review.
//
// --apply writes vehicle_chassis_specs (migration 012), replacing every row whose source
// is one of SOURCES.
//
// Usage:
//   node scripts/etl/16_chassis_specs.mjs          (dry run, reports/16_chassis_specs_<ts>.txt + .csv)
//   node scripts/etl/16_chassis_specs.mjs --apply

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import * as tires from '../catalog/specs/chassis/hd_tire_guide_2020.mjs';
import * as vtwin from '../catalog/specs/chassis/vtwin_axle_fork.mjs';
import { resolveSegment } from './lib/vendorterms.mjs';

const APPLY = process.argv.includes('--apply');
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const SOURCES = [tires, vtwin];

const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const yy = (s, up) => (s === 'later' || s === 'up' ? up : s.length === 4 ? +s : +s >= 50 ? 1900 + +s : 2000 + +s);
const span = (s, up) => { const [a, b] = s.split('-'); return [yy(a, up), yy(b, up)]; };

// Tire-guide model spec -> vehicles. "04-20 @XL -XL883C -XL883L:2011-2020", "91-09 XL883 XL883R".
function tireGuideMatches(spec, vehicles) {
  const [yr, ...toks] = spec.trim().split(/\s+/);
  const [y0, y1] = span(yr, 2020);
  const inc = toks.filter((t) => !t.startsWith('-'));
  const exc = toks.filter((t) => t.startsWith('-')).map((t) => { const [c, r] = t.slice(1).split(':'); return { c, r: r ? span(r, 2020) : null }; });
  const isCode = (v, c) => v.model_code === c || v.model_code === `${c}I`;
  const inGroup = (v, t) => (t === '@XL' ? v.platform === 'sportster' && /^XL/.test(v.model_code) : v.platform === t.slice(1));
  const out = [];
  for (const v of vehicles) {
    if (v.year < y0 || v.year > y1) continue;
    if (exc.some((e) => isCode(v, e.c) && (!e.r || (v.year >= e.r[0] && v.year <= e.r[1])))) continue;
    // A named code is a model match; a group ("Touring", "XL", "Dyna models") is weaker.
    if (inc.some((t) => !t.startsWith('@') && isCode(v, t))) out.push({ v, strength: 2 });
    else if (inc.some((t) => t.startsWith('@') && inGroup(v, t))) out.push({ v, strength: 1 });
  }
  return out;
}

async function main() {
  const vehicles = (await app.query('SELECT vehicle_id, year, model_code, platform, engine FROM vehicles')).rows;
  const facts = []; // { v, item, position, value, size_mm, source, rank, ref, strength }
  const review = [];
  const unmatched = [];

  // H-D tire guide.
  for (const [position, page, rim, tire, stock, ...specs] of tires.ROWS) {
    const [w, d] = rim.split(/\s*x\s*/i).map(Number);
    const sy = stock ? span(stock, 2020) : null;
    let n = 0;
    for (const spec of specs) {
      for (const { v, strength } of tireGuideMatches(spec, vehicles)) {
        if (sy && (v.year < sy[0] || v.year > sy[1])) continue;
        n++;
        const ref = `p${page}: ${spec.replace(/^\S+\s/, '')}`;
        facts.push({ v, item: 'wheel', position, value: `${d} x ${w.toFixed(2)} in`, size_mm: Math.round(d * 25.4 * 100) / 100, source: tires.SOURCE.key, rank: 1, ref, strength });
        facts.push({ v, item: 'tire', position, value: tire, size_mm: null, source: tires.SOURCE.key, rank: 1, ref, strength });
      }
    }
    if (!n) unmatched.push(`tire guide p${page} ${position} ${rim} ${tire}${stock ? ` (stock ${stock})` : ''}: ${specs.join('; ')}`);
  }

  // V-Twin axle / fork.
  for (const [itemPos, page, value, size_mm, spec] of vtwin.ROWS) {
    const [item, position = ''] = itemPos === 'fork_tube' ? ['fork_tube', ''] : itemPos.split('_');
    const [yr, ...toks] = spec.trim().split(/\s+/);
    const [y0, y1] = span(yr, vtwin.SOURCE.upTo);
    const exc = new Set(toks.filter((t) => t.startsWith('-')).map((t) => t.slice(1)));
    let n = 0;
    for (const tok of toks.filter((t) => !t.startsWith('-'))) {
      const r = resolveSegment(tok, y0, y1, vehicles);
      if (r.kind !== 'model' && r.kind !== 'family') { review.push(`V-Twin p${page} "${spec}": ${tok} -> ${r.kind} (${r.reason})`); continue; }
      for (const v of r.matches) {
        if (exc.has(v.model_code)) continue;
        n++;
        facts.push({ v, item, position, value, size_mm, source: vtwin.SOURCE.key, rank: 2, ref: `p${page}: ${yr} ${tok}`, strength: r.kind === 'model' ? 2 : 1 });
      }
    }
    if (!n) unmatched.push(`V-Twin p${page} ${itemPos} ${value}: ${spec}`);
  }

  // Per bike + item + position: H-D beats V-Twin; within a source a model token beats a family token.
  const groups = new Map();
  for (const f of facts) {
    const k = `${f.v.vehicle_id}|${f.item}|${f.position}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push(f);
  }
  const out = [];
  const dropped = { rank: 0, family: 0 };
  const conflicts = [];
  for (const fs_ of groups.values()) {
    const best = Math.min(...fs_.map((f) => f.rank));
    let keep = fs_.filter((f) => f.rank === best);
    dropped.rank += fs_.length - keep.length;
    const strong = Math.max(...keep.map((f) => f.strength));
    dropped.family += keep.filter((f) => f.strength < strong).length;
    keep = keep.filter((f) => f.strength === strong);
    const byVal = new Map();
    for (const f of keep) if (!byVal.has(f.value)) byVal.set(f.value, { ...f, refs: [f.ref] }); else byVal.get(f.value).refs.push(f.ref);
    const vals = [...byVal.values()];
    if (vals.length > 1 && vals[0].item !== 'tire') {
      const f = vals[0];
      conflicts.push(`${f.v.year} ${f.v.model_code.padEnd(10)} ${f.item} ${f.position}: ${vals.map((x) => `${x.value} [${x.refs.join(' | ')}]`).join('  vs  ')}`);
    }
    out.push(...vals);
  }
  out.sort((a, b) => a.v.platform.localeCompare(b.v.platform) || a.v.model_code.localeCompare(b.v.model_code) || a.v.year - b.v.year || a.item.localeCompare(b.item) || a.position.localeCompare(b.position));

  const tableExists = (await app.query(`SELECT to_regclass('vehicle_chassis_specs') IS NOT NULL AS ok`)).rows[0].ok;
  if (APPLY && !tableExists) throw new Error('vehicle_chassis_specs is missing: apply packages/db/migrations/012_vehicle_chassis_specs.sql first.');
  const existing = tableExists ? (await app.query('SELECT source, count(*)::int n FROM vehicle_chassis_specs GROUP BY 1')).rows : [];

  const L = [];
  L.push(`16_chassis_specs — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  L.push(`vehicle_chassis_specs: ${tableExists ? `exists, ${existing.map((r) => `${r.source} ${r.n}`).join(', ') || 'empty'}` : 'table not created yet (migration 012)'}`);
  for (const s of SOURCES) L.push(`Source: ${s.SOURCE.title} (${s.ROWS.length} transcribed rows, rank ${s.SOURCE.rank})`);
  L.push(`Rows to write: ${out.length}; dropped: ${dropped.rank} where an H-D row covers it, ${dropped.family} family rows under a model row`);
  const items = ['wheel|front', 'wheel|rear', 'tire|front', 'tire|rear', 'axle|front', 'fork_tube|'];
  const bikes = (pred) => new Set(out.filter(pred).map((f) => f.v.vehicle_id)).size;
  L.push(`Vehicles with any chassis spec: ${bikes(() => true)} of ${vehicles.length}`);
  for (const it of items) { const [i, p] = it.split('|'); L.push(`  ${(i + ' ' + p).padEnd(12)} ${bikes((f) => f.item === i && f.position === p)} bikes`); }
  L.push('');
  L.push('By platform / era (bikes with: wheel F / wheel R / axle F / fork tube, of bikes):');
  const eraOf = (y) => (y < 1984 ? '-1983' : y < 2000 ? '1984-99' : y < 2010 ? '2000-09' : y < 2018 ? '2010-17' : '2018+');
  const cells = new Map();
  for (const v of vehicles) { const k = `${v.platform}|${eraOf(v.year)}`; (cells.get(k) ?? cells.set(k, { n: 0, ids: new Set() }).get(k)).ids.add(v.vehicle_id); }
  const have = (i, p) => new Set(out.filter((f) => f.item === i && f.position === p).map((f) => f.v.vehicle_id));
  const wf = have('wheel', 'front'), wr = have('wheel', 'rear'), af = have('axle', 'front'), ft = have('fork_tube', '');
  for (const [k, c] of [...cells].sort()) {
    const ids = [...c.ids];
    const cnt = (s) => ids.filter((id) => s.has(id)).length;
    if (!ids.some((id) => wf.has(id) || wr.has(id) || af.has(id) || ft.has(id))) continue;
    L.push(`  ${k.replace('|', ' ').padEnd(24)} ${String(cnt(wf)).padStart(4)} ${String(cnt(wr)).padStart(4)} ${String(cnt(af)).padStart(4)} ${String(cnt(ft)).padStart(4)}  / ${ids.length}`);
  }
  L.push('');
  L.push(`Two sizes for one bike (review; both kept): ${conflicts.length}`);
  L.push(...conflicts.map((s) => `  ${s}`));
  L.push('');
  L.push(`Transcribed rows that matched no vehicle: ${unmatched.length}`);
  L.push(...unmatched.map((s) => `  ${s}`));
  L.push('');
  L.push(`Tokens not resolved: ${review.length}`);
  L.push(...review.map((s) => `  ${s}`));
  L.push('');
  L.push('Sample (every ~40th row):');
  for (const f of out.filter((_, i) => i % 40 === 0)) L.push(`  ${f.v.year} ${f.v.model_code.padEnd(10)} ${f.item.padEnd(9)} ${f.position.padEnd(5)} ${f.value.padEnd(14)} [${f.source} ${f.refs.join(' | ')}]`);

  fs.mkdirSync('reports', { recursive: true });
  const rp = path.join('reports', `16_chassis_specs_${ts}.txt`);
  fs.writeFileSync(rp, L.join('\n') + '\n');
  const cols = ['year', 'model_code', 'platform', 'item', 'position', 'value', 'size_mm', 'source', 'source_ref'];
  fs.writeFileSync(rp.replace('.txt', '.csv'), [cols.join(','), ...out.map((f) => [f.v.year, f.v.model_code, f.v.platform, f.item, f.position, f.value, f.size_mm, f.source, f.refs.join(' | ')].map(csvCell).join(','))].join('\n') + '\n');
  console.log(L.join('\n'));
  console.log(`\n→ ${rp} (+ .csv).`);
  if (!APPLY) { console.log('Dry run: nothing written. Re-run with --apply to write vehicle_chassis_specs.'); return; }

  const client = await app.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query('DELETE FROM vehicle_chassis_specs WHERE source = ANY($1)', [SOURCES.map((s) => s.SOURCE.key)]);
    const ins = await client.query(
      `INSERT INTO vehicle_chassis_specs (vehicle_id, item, position, value, size_mm, source, source_rank, source_ref)
       SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::numeric[], $6::text[], $7::smallint[], $8::text[])`,
      [out.map((f) => f.v.vehicle_id), out.map((f) => f.item), out.map((f) => f.position), out.map((f) => f.value), out.map((f) => f.size_mm),
        out.map((f) => f.source), out.map((f) => f.rank), out.map((f) => f.refs.join(' | '))]
    );
    await client.query('COMMIT');
    console.log(`Deleted ${del.rowCount}, inserted ${ins.rowCount} vehicle_chassis_specs rows.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => app.end());
