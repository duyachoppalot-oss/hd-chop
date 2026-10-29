// scripts/etl/18_vtwin_cable_lengths.mjs
//
// Stock cable / line lengths per H-D number from the V-Twin Mfg catalog, into
// oem_part_lengths (migration 013). DATA_RIGHTS row approved by Laken 2026-10-29.
// Input: the hand-reviewed list scripts/catalog/specs/vtwin_cable_lengths.csv (one row
// per length printed next to an H-D number, page + quoted line as evidence; check it with
// scripts/catalog/vtwin_cables_check.py). Loaded:
//   - confidence high or medium (low rows stay in the list for review);
//   - rows with an H-D number (stock lengths printed for a model-year without one are not loaded);
//   - numbers already in oem_parts (never new parts; a letter-suffix sibling is reported, not used).
// Values are re-expressed as our own: '7-3/4 in', '62.69 in'; the catalog line is not stored.
//
// --apply: deletes earlier source='vtwin' rows, inserts this run's. Fitment is untouched
// (no 05-08 needed). Remove: DELETE FROM oem_part_lengths WHERE source = 'vtwin'.
//
// Usage:
//   node scripts/etl/18_vtwin_cable_lengths.mjs           (dry run, reports/18_vtwin_cable_lengths_<ts>.txt + .csv)
//   node scripts/etl/18_vtwin_cable_lengths.mjs --apply

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { readCsv } from './lib/csv.mjs';

const APPLY = process.argv.includes('--apply');
const SRC = 'scripts/catalog/specs/vtwin_cable_lengths.csv';
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const csvCell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));

// 'battery cable (solenoid to starter)' -> item battery_cable, detail 'solenoid to starter'
const ITEMS = [
  [/^clutch\b/, 'clutch_cable'], [/^throttle\b/, 'throttle_cable'], [/^speedometer\b/, 'speedometer_cable'],
  [/^tachometer\b/, 'tach_cable'], [/^battery cable\b/, 'battery_cable'], [/brake hose\b/, 'brake_hose'],
];
function itemOf(cable) {
  const hit = ITEMS.find(([re]) => re.test(cable));
  if (!hit) return null;
  const inner = cable.match(/\((.+)\)/)?.[1] ?? '';
  const front = /^front /.test(cable) ? 'front' : '';
  return { item: hit[1], kind: [front, inner].filter(Boolean).join(' ') };
}
// '5/8” nut; female' -> '5/8 in top nut, female end'
const endOf = (s) => s.split(';').map((x) => x.trim()).filter(Boolean)
  .map((x) => x.replace(/”/g, ' in').replace(/ nut$/, ' top nut').replace(/^(male|female)$/, '$1 end')).join(', ');

// 7.75 -> '7-3/4 in'; 62.69 -> '62.69 in' (eighths only become fractions)
function valueOf(n) {
  const whole = Math.floor(n), e = Math.round((n - whole) * 8);
  if (Math.abs(n - whole - e / 8) > 1e-9) return `${n} in`;
  if (!e) return `${whole} in`;
  const g = e % 4 === 0 ? 4 : e % 2 === 0 ? 2 : 1;
  return `${whole}-${e / g}/${8 / g} in`;
}

async function main() {
  const rows = readCsv(SRC);
  const keys = [...new Set(rows.filter((r) => r.oem).map((r) => r.oem.replace(/-/g, '').toUpperCase()))];
  const parts = new Map((await app.query(`SELECT oem_number, oem_display, description_clean FROM oem_parts WHERE oem_number = ANY($1)`, [keys])).rows.map((r) => [r.oem_number, r]));
  const sib = new Map();
  for (const k of keys.filter((k) => !parts.has(k))) {
    const base = k.replace(/[A-Z]+$/, '');
    sib.set(k, (await app.query(`SELECT string_agg(oem_display, ' ') s FROM oem_parts WHERE oem_number LIKE $1`, [`${base}%`])).rows[0].s ?? '');
  }

  const out = [], skipped = { low: [], noOem: [], notInParts: [], badItem: [] }, seen = new Set();
  for (const r of rows) {
    const tag = `p${r.page} ${r.oem || '(no H-D no.)'} ${r.cable} ${r.length_as_printed}`;
    if (!r.oem) { skipped.noOem.push(tag); continue; }
    if (!['high', 'medium'].includes(r.confidence)) { skipped.low.push(tag); continue; }
    const key = r.oem.replace(/-/g, '').toUpperCase();
    if (!parts.has(key)) { skipped.notInParts.push(`${tag}${sib.get(key) ? `  (app has ${sib.get(key)})` : ''}`); continue; }
    const it = itemOf(r.cable);
    if (!it) { skipped.badItem.push(tag); continue; }
    const length = Number(r.length_in);
    const source_ref = `VT p${r.page.replace('+', ' + p')}`;
    const u = `${key}|${it.item}|${length}|${source_ref}`;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({
      oem_number: key, display: parts.get(key).oem_display, item: it.item, detail: [it.kind, endOf(r.end_or_nut)].filter(Boolean).join(', '),
      length_in: length, value: valueOf(length), years: r.years, models: r.models, source_ref, confidence: r.confidence, note: r.note || null,
    });
  }
  out.sort((a, b) => a.item.localeCompare(b.item) || a.display.localeCompare(b.display) || a.length_in - b.length_in);

  const tableExists = (await app.query(`SELECT to_regclass('oem_part_lengths') IS NOT NULL AS ok`)).rows[0].ok;
  if (APPLY && !tableExists) throw new Error('oem_part_lengths is missing: apply packages/db/migrations/013_oem_part_lengths.sql first.');
  const existing = tableExists ? (await app.query('SELECT source, count(*)::int n FROM oem_part_lengths GROUP BY 1')).rows : [];

  const count = (k) => Object.entries(out.reduce((m, f) => ((m[f[k]] = (m[f[k]] ?? 0) + 1), m), {})).map(([a, n]) => `${a} ${n}`).join(', ');
  const L = [];
  L.push(`18_vtwin_cable_lengths — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  L.push(`oem_part_lengths: ${tableExists ? `exists, ${existing.map((r) => `${r.source} ${r.n}`).join(', ') || 'empty'}` : 'table not created yet (migration 013)'}`);
  L.push(`Source: ${SRC} (${rows.length} reviewed rows)`);
  L.push(`Rows to write: ${out.length} for ${new Set(out.map((f) => f.oem_number)).size} H-D numbers`);
  L.push(`  by item: ${count('item')}`);
  L.push(`  by confidence: ${count('confidence')}`);
  L.push(`Numbers with more than one length: ${[...new Set(out.map((f) => f.oem_number))].filter((k) => new Set(out.filter((f) => f.oem_number === k).map((f) => f.length_in)).size > 1).map((k) => parts.get(k).oem_display).join(' ')}`);
  for (const [k, label] of [['notInParts', 'H-D number not in oem_parts'], ['low', 'low confidence (stay for review)'], ['noOem', 'no H-D number (stock length by model-year only)'], ['badItem', 'unknown cable type']]) {
    L.push('');
    L.push(`Skipped, ${label}: ${skipped[k].length}`);
    L.push(...skipped[k].map((s) => `  ${s}`));
  }
  L.push('');
  L.push('Sample (first 20):');
  for (const f of out.slice(0, 20)) L.push(`  ${f.display.padEnd(10)} ${f.item.padEnd(17)} ${f.value.padEnd(11)} ${(f.detail || '-').padEnd(26)} ${f.years.padEnd(22)} ${f.models.slice(0, 40).padEnd(40)} [${f.source_ref}, ${f.confidence}]`);

  fs.mkdirSync('reports', { recursive: true });
  const rp = path.join('reports', `18_vtwin_cable_lengths_${ts}.txt`);
  fs.writeFileSync(rp, L.join('\n') + '\n');
  const cols = ['oem_number', 'item', 'detail', 'length_in', 'value', 'years', 'models', 'source_ref', 'confidence', 'note'];
  fs.writeFileSync(rp.replace('.txt', '.csv'), [cols.join(','), ...out.map((f) => cols.map((c) => csvCell(c === 'oem_number' ? f.display : f[c])).join(','))].join('\n') + '\n');
  console.log(L.join('\n'));
  console.log(`\n→ ${rp} (+ .csv).`);
  if (!APPLY) { console.log('Dry run: nothing written. Re-run with --apply to write oem_part_lengths.'); return; }

  const client = await app.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query(`DELETE FROM oem_part_lengths WHERE source = 'vtwin'`);
    const ins = await client.query(
      `INSERT INTO oem_part_lengths (oem_number, item, detail, length_in, value, years, models, source, source_ref, confidence, note)
       SELECT a, b, c, d, e, f, g, 'vtwin', h, i, j
       FROM unnest($1::text[], $2::text[], $3::text[], $4::numeric[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[]) AS t(a, b, c, d, e, f, g, h, i, j)`,
      ['oem_number', 'item', 'detail', 'length_in', 'value', 'years', 'models', 'source_ref', 'confidence', 'note'].map((c) => out.map((f) => f[c]))
    );
    await client.query('COMMIT');
    console.log(`Deleted ${del.rowCount}, inserted ${ins.rowCount} oem_part_lengths rows.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => app.end());
