#!/usr/bin/env node
// Dry-run report of what the H-D owner's manuals' Specifications tables would give us, per
// model-year. Reads the tables pulled by ~/Developer/catalog-extract/manual_specs.py
// (specs.json); writes nothing to the DB (SELECTs oem_parts to check printed part numbers).
//
//   python3 -I ~/Developer/catalog-extract/manual_specs.py ~/Developer/catalog-extract/manuals > ~/Developer/catalog-extract/manuals/specs.json
//   node scripts/catalog/manual_specs_report.mjs [specs.json]
//
// Writes reports/manual_specs_<ts>.txt (coverage per kind x year, sample rows) and
// reports/manual_specs_rows_<ts>.csv (every table row: year, manual, kind, table, label, values).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import 'dotenv/config';

const src = process.argv[2] ?? path.join(os.homedir(), 'Developer/catalog-extract/manuals/specs.json');
const specs = JSON.parse(fs.readFileSync(src, 'utf8'));
const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);

const KIND = [
  ['engine', /engine/i], ['transmission', /transmission/i], ['gear_ratios', /gear ratio/i], ['sprockets', /sprocket/i],
  ['ignition', /ignition system|spark/i], ['capacities', /capacit/i], ['weights', /weight/i], ['dimensions', /dimension/i],
  ['tire_pressure', /tire pressure|inflation/i], ['tire_sizes', /tire size|tires/i], ['bulbs', /bulb/i], ['fuel', /octane|fuel/i],
  ['suspension', /suspension|air pressure|fork/i], ['electrical', /electrical|battery|fuse/i], ['brakes', /brake/i], ['wheels', /wheel/i],
];
const LABEL = [
  ['engine', /\b(bore|stroke|displacement|compression ratio|cylinders|horsepower|torque)\b/i], ['gear_ratios', /\b(first|second|third|fourth|fifth|low|high)\b.*gear/i],
  ['sprockets', /sprocket|teeth/i], ['ignition', /spark plug|timing|gap\b/i], ['capacities', /fuel tank|oil tank|\(quarts\)|\(gallons\)|\(pints?\)|\(ounces\)|reserve/i],
  ['weights', /\b(gvwr|gawr|weight)\b/i], ['dimensions', /wheel ?base|overall (length|width|height)|road clearance|saddle height|seat height/i],
  ['tire_pressure', /\bpsi\b|pressure/i], ['tire_sizes', /\btires?\b/i], ['transmission', /transmission|speeds|constant mesh/i], ['electrical', /battery|alternator|volt/i],
];
const labelKind = (t) => LABEL.find(([, re]) => re.test(t))?.[0] ?? null;
const kindOf = (t) => KIND.find(([, re]) => re.test(t))?.[0] ?? 'other';
const yearOf = (t) => Number(/\b(19[4-9]\d|20[0-3]\d)\b/.exec(t)?.[1] ?? 0) || null;
const familyOf = (t) => {
  const s = t.toUpperCase();
  for (const [f, re] of [['touring', /TOURING|FLT\/|FLHT|ELECTRA/], ['softail', /SOFTAIL/], ['dyna', /DYNA/], ['sportster', /SPORTSTER|\bXL\b/],
    ['v_rod', /V-ROD|VRSC/], ['street', /STREET\b|XG/], ['trike', /TRIKE|TRI GLIDE|FREEWHEELER/], ['fxr', /FXR/], ['cvo', /CVO/],
    ['livewire', /LIVEWIRE|LWZ|S2|S3|S4/], ['pan_america', /PAN AMERICA|ADVENTURE TOURING/], ['sidecar', /SIDECAR/], ['fl_fx', /FL\/FX/]]) if (re.test(s)) return f;
  return 'other';
};
const PN = /\b(\d{4,5}-\d{2}[A-Z]{0,2}|\d{8}[A-Z]{0,2})\b/g;

const rows = [];
const perManual = [];
for (const [file, m] of Object.entries(specs)) {
  const year = yearOf(m.title), family = familyOf(m.title);
  const kinds = new Set();
  for (const t of m.tables ?? []) {
    const kind = kindOf(t.title);
    if (t.col !== 'ocr') kinds.add(kind);
    for (const r of t.rows) {
      // scanned manuals: the page has no table captions, so the row's own label says what it is
      const rk = t.col === 'ocr' ? labelKind(r.join(' ')) : kind;
      if (t.col === 'ocr') { if (!rk) continue; kinds.add(rk); }
      if (r.length < 2 || /^(ITEM|COMPONENT|MODEL|LAMP|GEAR|DRIVE|SPECIFICATION|IN\.|LB\.|PSI)\b/i.test(r[0]) || /^\d+ Specifications|Specifications \d+$/.test(r.join(' '))) continue;
      rows.push({ year, family, file, title: m.title, kind: rk, table: t.title, page: t.page, label: r[0], values: r.slice(1).join(' | ') });
    }
  }
  perManual.push({ file, title: m.title, year, family, pages: m.pages, tables: (m.tables ?? []).length, kinds: [...kinds], error: m.error });
}

// H-D part numbers printed in the tables (bulbs, mostly) vs our parts
const pns = [...new Set(rows.flatMap((r) => [...`${r.label} ${r.values}`.matchAll(PN)].map((x) => x[1])))];
const pool = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const known = new Set((await pool.query(`SELECT oem_number FROM oem_parts WHERE oem_number = ANY($1) OR oem_display = ANY($1)`, [pns])).rows.map((r) => r.oem_number));
await pool.end();

const years = [...new Set(perManual.map((m) => m.year).filter(Boolean))].sort();
const kinds = KIND.map(([k]) => k);
const cov = (k, y) => perManual.filter((m) => m.year === y && m.kinds.includes(k)).length;
const L = [];
L.push(`manual_specs_report (dry run, nothing loaded) ${ts}`, `source ${src}`, '');
L.push(`manuals: ${perManual.length}; with spec tables: ${perManual.filter((m) => m.tables).length}; no text layer (scans, need OCR): ${perManual.filter((m) => !m.tables).length}`);
L.push(`table rows: ${rows.length}; H-D part numbers printed: ${pns.length}, in oem_parts: ${known.size}`, '');
L.push('Manuals with spec tables, per year (count of manuals that have each kind):');
L.push(['year', 'manuals', ...kinds].join('\t'));
for (const y of years) L.push([y, perManual.filter((m) => m.year === y).length, ...kinds.map((k) => cov(k, y) || '.')].join('\t'));
L.push('', 'Rows per kind:');
for (const k of [...kinds, 'other']) L.push(`  ${k.padEnd(14)} ${rows.filter((r) => r.kind === k).length}`);
L.push('', 'Manuals without spec tables:');
for (const m of perManual.filter((m) => !m.tables)) L.push(`  ${m.year ?? '----'} ${m.title} (${m.pages} pp)${m.error ? ` ERROR ${m.error}` : ''}`);
L.push('', 'Part numbers printed but not in oem_parts:', '  ' + pns.filter((p) => !known.has(p) && !known.has(p.replace(/-/g, ''))).join(' '));
L.push('', 'Sample rows (2 per kind):');
for (const k of kinds) for (const r of rows.filter((r) => r.kind === k).slice(0, 2)) L.push(`  ${r.year} ${r.family.padEnd(10)} ${k.padEnd(13)} ${r.label} = ${r.values}  [${r.table}, p${r.page}]`);
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(`reports/manual_specs_${ts}.txt`, L.join('\n') + '\n');
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(`reports/manual_specs_rows_${ts}.csv`, ['year,family,kind,manual,table,page,label,values', ...rows.map((r) => [r.year, r.family, r.kind, q(r.title), q(r.table), r.page, q(r.label), q(r.values)].join(','))].join('\n') + '\n');
console.log(`→ reports/manual_specs_${ts}.txt (+ rows CSV). ${perManual.length} manuals, ${rows.length} rows.`);
