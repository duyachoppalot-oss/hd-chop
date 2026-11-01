#!/usr/bin/env node
// Owner's-manual spec-table rows -> manual_specs (migration 017). Admin only (DATA_RIGHTS
// 2026-11-01): hdchop_api has no grant on the table.
//
//   node scripts/catalog/manual_specs_report.mjs        (writes reports/manual_specs_rows_<ts>.csv)
//   node scripts/etl/22_manual_specs.mjs                dry run: counts + 20 sample rows
//   node scripts/etl/22_manual_specs.mjs --apply        replace manual_specs
//
// Reads the newest rows CSV and the manuals' H-D references from specs.json. Rows from
// OCR'd scans (table "OCR spec page: ...") are kept with ocr = true.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import 'dotenv/config';
import { readCsv } from './lib/csv.mjs';

const APPLY = process.argv.includes('--apply');
const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
const file = fs.readdirSync('reports').filter((f) => /^manual_specs_rows_.*\.csv$/.test(f)).sort().at(-1);
if (!file) throw new Error('no reports/manual_specs_rows_*.csv: run scripts/catalog/manual_specs_report.mjs first');
const specs = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Developer/catalog-extract/manuals/specs.json'), 'utf8'));
const refOf = new Map(Object.values(specs).map((m) => [m.title, String(m.reference ?? '').replace(/_.*/, '')]));

const rows = readCsv(path.join('reports', file))
  .filter((r) => r.year && r.label && r.values)
  .map((r) => ({
    year: Number(r.year), family: r.family, manual: r.manual, manual_ref: refOf.get(r.manual) ?? '', kind: r.kind,
    table_title: r.table, page: Number(r.page) || null, label: r.label.slice(0, 300), value: r.values.slice(0, 500),
    ocr: r.table.startsWith('OCR spec page'),
  }));

const by = (k) => Object.entries(rows.reduce((a, r) => ((a[r[k]] = (a[r[k]] ?? 0) + 1), a), {})).sort((a, z) => z[1] - a[1]);
const L = [`22_manual_specs (${APPLY ? 'APPLY' : 'dry run'}) ${ts}`, `source reports/${file}`, '',
  `rows: ${rows.length} (ocr ${rows.filter((r) => r.ocr).length}); manuals: ${new Set(rows.map((r) => r.manual)).size}; years ${Math.min(...rows.map((r) => r.year))}-${Math.max(...rows.map((r) => r.year))}`,
  '', 'By kind:', ...by('kind').map(([k, n]) => `  ${k.padEnd(14)} ${n}`), '', 'By family:', ...by('family').map(([k, n]) => `  ${k.padEnd(14)} ${n}`),
  '', 'Sample (20):', ...rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 20)) === 0).slice(0, 20).map((r) => `  ${r.year} ${r.family} ${r.kind}: ${r.label} = ${r.value} [${r.manual_ref || r.manual} p${r.page}${r.ocr ? ', OCR' : ''}]`)];
fs.writeFileSync(`reports/22_manual_specs_${ts}.txt`, L.join('\n') + '\n');

if (APPLY) {
  const pool = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('DELETE FROM manual_specs');
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const vals = [], args = [];
      chunk.forEach((r, j) => {
        vals.push(`(${Array.from({ length: 10 }, (_, k) => `$${j * 10 + k + 1}`).join(',')})`);
        args.push(r.year, r.family, r.manual, r.manual_ref, r.kind, r.table_title, r.page, r.label, r.value, r.ocr);
      });
      await db.query(`INSERT INTO manual_specs (year, family, manual, manual_ref, kind, table_title, page, label, value, ocr) VALUES ${vals.join(',')}`, args);
    }
    await db.query('COMMIT');
    console.log(`Applied ${rows.length} manual_specs rows.`);
  } catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); await pool.end(); }
}
console.log(`→ reports/22_manual_specs_${ts}.txt (${rows.length} rows)`);
