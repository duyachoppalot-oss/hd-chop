// scripts/etl/19_vtwin_rotor_sprocket.mjs
//
// Brake rotor diameters and sprocket tooth counts per H-D number from the V-Twin Mfg
// catalog, into oem_part_sizes (migration 014). DATA_RIGHTS row approved by Laken 2026-10-29.
// Input: the hand-reviewed list scripts/catalog/specs/vtwin_rotor_sprocket.csv (one row per
// size printed next to an H-D number, page + quoted line as evidence). Loaded:
//   - confidence high or medium (low rows stay in the list for review);
//   - rows with an H-D number (stock sizes printed for a model-year without one are not loaded);
//   - numbers already in oem_parts (never new parts).
// Values are re-expressed as our own: '11.5 in', '24 teeth'; the catalog line is not stored.
//
// --apply: deletes earlier source='vtwin' rows, inserts this run's. Fitment is untouched
// (no 05-08 needed). Remove: DELETE FROM oem_part_sizes WHERE source = 'vtwin'.
//
// Usage:
//   node scripts/etl/19_vtwin_rotor_sprocket.mjs           (dry run, reports/19_vtwin_rotor_sprocket_<ts>.txt + .csv)
//   node scripts/etl/19_vtwin_rotor_sprocket.mjs --apply

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { readCsv } from './lib/csv.mjs';

const APPLY = process.argv.includes('--apply');
const SRC = 'scripts/catalog/specs/vtwin_rotor_sprocket.csv';
const ITEMS = ['brake_rotor', 'engine_sprocket', 'compensator_sprocket', 'countershaft_sprocket', 'rear_sprocket'];
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const csvCell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));

async function main() {
  const rows = readCsv(SRC);
  const keys = [...new Set(rows.filter((r) => r.oem).map((r) => r.oem.replace(/-/g, '').toUpperCase()))];
  const parts = new Map((await app.query(`SELECT oem_number, oem_display FROM oem_parts WHERE oem_number = ANY($1)`, [keys])).rows.map((r) => [r.oem_number, r]));

  const out = [], skipped = { low: [], noOem: [], notInParts: [], bad: [] };
  for (const r of rows) {
    const tag = `p${r.page} ${r.oem || '(no H-D no.)'} ${r.item} ${r.position} ${r.value_as_printed}`;
    if (!r.oem) { skipped.noOem.push(tag); continue; }
    if (!['high', 'medium'].includes(r.confidence)) { skipped.low.push(tag); continue; }
    const key = r.oem.replace(/-/g, '').toUpperCase();
    if (!parts.has(key)) { skipped.notInParts.push(tag); continue; }
    const n = Number(r.value);
    if (!ITEMS.includes(r.item) || !['in', 'teeth'].includes(r.unit) || !(n > 0)) { skipped.bad.push(tag); continue; }
    out.push({
      oem_number: key, display: parts.get(key).oem_display, item: r.item, measure: r.unit === 'in' ? 'diameter' : 'teeth',
      position: r.position, value_num: n, value: r.unit === 'in' ? `${n} in` : `${n} teeth`,
      detail: r.detail.replace(/;\s*/g, ', '), years: r.years, models: r.models, source_ref: `VT p${r.page}`,
      confidence: r.confidence, note: r.note || null,
    });
  }
  out.sort((a, b) => a.item.localeCompare(b.item) || a.display.localeCompare(b.display) || a.position.localeCompare(b.position));

  const tableExists = (await app.query(`SELECT to_regclass('oem_part_sizes') IS NOT NULL AS ok`)).rows[0].ok;
  if (APPLY && !tableExists) throw new Error('oem_part_sizes is missing: apply packages/db/migrations/014_oem_part_sizes.sql first.');
  const existing = tableExists ? (await app.query('SELECT source, count(*)::int n FROM oem_part_sizes GROUP BY 1')).rows : [];

  const count = (k) => Object.entries(out.reduce((m, f) => ((m[f[k]] = (m[f[k]] ?? 0) + 1), m), {})).map(([a, n]) => `${a} ${n}`).join(', ');
  const L = [];
  L.push(`19_vtwin_rotor_sprocket — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  L.push(`oem_part_sizes: ${tableExists ? `exists, ${existing.map((r) => `${r.source} ${r.n}`).join(', ') || 'empty'}` : 'table not created yet (migration 014)'}`);
  L.push(`Source: ${SRC} (${rows.length} reviewed rows)`);
  L.push(`Rows to write: ${out.length} for ${new Set(out.map((f) => f.oem_number)).size} H-D numbers`);
  L.push(`  by item: ${count('item')}`);
  L.push(`  by confidence: ${count('confidence')}`);
  const multi = [...new Set(out.map((f) => f.oem_number))].filter((k) => new Set(out.filter((f) => f.oem_number === k).map((f) => `${f.position} ${f.value_num}`)).size > 1);
  L.push(`Numbers with more than one size / position: ${multi.map((k) => parts.get(k).oem_display).join(' ') || 'none'}`);
  for (const [k, label] of [['notInParts', 'H-D number not in oem_parts'], ['low', 'low confidence (stay for review)'], ['noOem', 'no H-D number (stock size by model-year only)'], ['bad', 'unknown item / unit / value']]) {
    L.push('');
    L.push(`Skipped, ${label}: ${skipped[k].length}`);
    L.push(...skipped[k].map((s) => `  ${s}`));
  }
  L.push('');
  L.push('Rows:');
  for (const f of out) L.push(`  ${f.display.padEnd(10)} ${f.item.padEnd(21)} ${f.position.padEnd(5)} ${f.value.padEnd(9)} ${(f.detail || '-').slice(0, 34).padEnd(34)} ${f.years.padEnd(22)} ${f.models.slice(0, 34).padEnd(34)} [${f.source_ref}, ${f.confidence}]`);

  fs.mkdirSync('reports', { recursive: true });
  const rp = path.join('reports', `19_vtwin_rotor_sprocket_${ts}.txt`);
  fs.writeFileSync(rp, L.join('\n') + '\n');
  const cols = ['oem_number', 'item', 'measure', 'position', 'value_num', 'value', 'detail', 'years', 'models', 'source_ref', 'confidence', 'note'];
  fs.writeFileSync(rp.replace('.txt', '.csv'), [cols.join(','), ...out.map((f) => cols.map((c) => csvCell(c === 'oem_number' ? f.display : f[c])).join(','))].join('\n') + '\n');
  console.log(L.join('\n'));
  console.log(`\n→ ${rp} (+ .csv).`);
  if (!APPLY) { console.log('Dry run: nothing written. Re-run with --apply to write oem_part_sizes.'); return; }

  const client = await app.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query(`DELETE FROM oem_part_sizes WHERE source = 'vtwin'`);
    const ins = await client.query(
      `INSERT INTO oem_part_sizes (oem_number, item, measure, position, value_num, value, detail, years, models, source, source_ref, confidence, note)
       SELECT a, b, c, d, e, f, g, h, i, 'vtwin', j, k, l
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::numeric[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::text[])
         AS t(a, b, c, d, e, f, g, h, i, j, k, l)`,
      ['oem_number', 'item', 'measure', 'position', 'value_num', 'value', 'detail', 'years', 'models', 'source_ref', 'confidence', 'note'].map((c) => out.map((f) => f[c]))
    );
    await client.query('COMMIT');
    console.log(`Deleted ${del.rowCount}, inserted ${ins.rowCount} oem_part_sizes rows.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => app.end());
