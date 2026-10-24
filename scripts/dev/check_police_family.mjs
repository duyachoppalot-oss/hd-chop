// scripts/dev/check_police_family.mjs
//
// Read-only check: the (part, police vehicle) pairs 03 makes from family rows
// ("FLT: 95*-ALL") -- does that year's Police parts catalog (scraped
// service-portal books, lib/servicecatalog.mjs) list the part?
//   listed      the part appears anywhere in that year's police book
//   not_listed  a police book exists for the year and lacks the part
//   no_book     no police book for that year
// Also: are the same parts listed in that year's regular touring book (so the
// family row is right for civilian touring but not police)?
//
// Usage: node scripts/dev/check_police_family.mjs > reports/police_family.txt 2>&1

import 'dotenv/config';
import pg from 'pg';
import { makeTargeter } from '../etl/lib/fitment.mjs';
import { classify, normalize } from '../etl/lib/parts.mjs';
import { readBooks } from '../etl/lib/servicecatalog.mjs';

const source = new pg.Pool({ connectionString: process.env.SOURCE_DATABASE_URL });
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const POLICE = /^(FLHP|FLHTP|FLHTPI|FLTRXP|FXRP|FLHPE|FLHPI|FLHTPE)$/;

async function main() {
  const rows = (
    await source.query(`SELECT id, part_number, description, used_on_raw, year_start, year_end, source_document_title AS doc FROM hd_oem_catalog_reference ORDER BY id`)
  ).rows;
  const fitmentSrc = (
    await source.query(`SELECT DISTINCT upper(trim(oem_part_no)) AS display, catalog_year_start AS year_start, catalog_year_end AS year_end FROM oem_fitment WHERE oem_part_no IS NOT NULL`)
  ).rows;
  const vehicles = (await app.query(`SELECT vehicle_id, year, model_code, platform FROM vehicles`)).rows;
  const parts = new Set((await app.query(`SELECT oem_number FROM oem_parts`)).rows.map((r) => r.oem_number));
  const names = new Map((await app.query(`SELECT oem_number, description_clean FROM oem_parts`)).rows.map((r) => [r.oem_number, r.description_clean]));
  const { target } = makeTargeter({ rows, fitmentSrc, vehicles, parts });

  // Pairs 03 makes for police vehicles, by kind; family-only pairs = only a family row reaches them.
  const byKind = new Map(); // key -> Set(kind)
  const famRow = new Map(); // key -> example row
  rows.forEach((r, i) => {
    const t = target(r, i);
    if (t.status !== 'ok') return;
    for (const [v] of t.targets) {
      if (!POLICE.test(v.model_code)) continue;
      const key = `${t.oem}|${v.year}|${v.model_code}`;
      if (!byKind.has(key)) byKind.set(key, new Set());
      byKind.get(key).add(t.kind);
      if (t.kind === 'family' && !famRow.has(key)) famRow.set(key, r);
    }
  });
  const familyOnly = [...byKind].filter(([, ks]) => ks.size === 1 && ks.has('family')).map(([k]) => k);

  // Scraped books: part -> years listed, for police and touring books.
  const { rows: tsv, books } = readBooks();
  const fam = new Map(books.map((b) => [b.slug, b.family]));
  const inBook = { police: new Map(), touring: new Map() };
  const bookYears = { police: new Set(), touring: new Set() };
  for (const r of tsv) {
    const f = fam.get(r.doc);
    if (f !== 'police' && f !== 'touring') continue;
    const { cls, display } = classify(r.part_number);
    if (!['std', 'modern', 'hardware'].includes(cls)) continue;
    const oem = normalize(display);
    for (let y = r.year_start; y <= r.year_end; y++) {
      bookYears[f].add(y);
      if (!inBook[f].has(oem)) inBook[f].set(oem, new Set());
      inBook[f].get(oem).add(y);
    }
  }

  const out = { listed: [], not_listed: [], no_book: [] };
  for (const key of familyOnly) {
    const [oem, y] = key.split('|');
    const year = Number(y);
    const cls = !bookYears.police.has(year) ? 'no_book' : inBook.police.get(oem)?.has(year) ? 'listed' : 'not_listed';
    out[cls].push(key);
  }

  const lines = [];
  lines.push(`Police (part, vehicle) pairs 03 would make: ${byKind.size}; reached ONLY by family rows: ${familyOnly.length}`);
  const yrs = {};
  for (const k of familyOnly) { const y = k.split('|')[1]; yrs[y] = (yrs[y] || 0) + 1; }
  lines.push(`  by year: ${Object.entries(yrs).sort().map(([y, n]) => `${y}:${n}`).join(' ')}`);
  const docs = {};
  for (const k of familyOnly) { const d = famRow.get(k).doc; docs[d] = (docs[d] || 0) + 1; }
  lines.push(`  source documents: ${Object.entries(docs).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} (${n})`).join('; ')}`);
  const raws = {};
  for (const k of familyOnly) { const u = famRow.get(k).used_on_raw; raws[u] = (raws[u] || 0) + 1; }
  lines.push(`  used_on_raw: ${Object.entries(raws).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([u, n]) => `"${u}" (${n})`).join('; ')}`);
  lines.push('');
  lines.push('Against that year\'s scraped Police parts catalog:');
  for (const c of ['listed', 'not_listed', 'no_book']) lines.push(`  ${c.padEnd(11)} ${out[c].length}`);
  const nl = out.not_listed;
  const inTouring = nl.filter((k) => { const [o, y] = k.split('|'); return inBook.touring.get(o)?.has(Number(y)); });
  lines.push(`  not_listed but in that year's touring book: ${inTouring.length}`);
  const byYear = {};
  for (const c of ['listed', 'not_listed'])
    for (const k of out[c]) { const [, y, code] = k.split('|'); const e = (byYear[`${y} ${code}`] ||= { listed: 0, not_listed: 0 }); e[c]++; }
  lines.push('  by year/model (listed / not_listed in that year\'s police book):');
  for (const [k, e] of Object.entries(byYear).sort()) lines.push(`    ${k.padEnd(12)} ${String(e.listed).padStart(4)} / ${String(e.not_listed).padStart(4)}`);
  lines.push('');
  const sample = (xs, n) => xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / n)) === 0).slice(0, n);
  for (const c of ['listed', 'not_listed', 'no_book']) {
    lines.push(`Sample ${c} (20):`);
    for (const k of sample(out[c], 20)) {
      const [oem, y, code] = k.split('|');
      const r = famRow.get(k);
      lines.push(`  ${oem.padEnd(11)} ${y} ${code.padEnd(7)} ${(names.get(oem) ?? '').slice(0, 34).padEnd(34)} "${r.used_on_raw}" ${r.doc.slice(0, 30)}`);
    }
  }
  if (process.env.DUMP_NOT_LISTED_YEAR) {
    const y0 = process.env.DUMP_NOT_LISTED_YEAR;
    lines.push(`All not_listed ${y0}:`);
    for (const k of out.not_listed.filter((k) => k.split('|')[1] === y0).sort((a, b) => (names.get(a.split('|')[0]) ?? '').localeCompare(names.get(b.split('|')[0]) ?? '')))
      lines.push(`  ${k.split('|')[0].padEnd(11)} ${names.get(k.split('|')[0]) ?? ''}`);
  }
  console.log(lines.join('\n'));
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => { source.end(); app.end(); });
