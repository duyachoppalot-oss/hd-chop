// scripts/etl/11_catalog_books.mjs — DRY RUN ONLY (no --apply yet)
//
// Reads the OCR page cache of the parts-catalog PDFs (scripts/catalog/ocr.mjs), parses the
// rows (scripts/catalog/parse.mjs) and reports what they would add. Writes nothing to either
// database. Read-only checks against:
//   hdchop: vehicles (does the bike exist?), oem_parts (do we know the number?), fitment
//           (is this part already fitted to this bike-year?)
//   source: hd_oem_catalog_reference rows from the same book (what Stinkin' already extracted)
// "All Models" in a book = the codes that book names for that year, plus our vehicles with
// those codes in that year.
//
// Reports (reports/):
//   11_catalog_books_<ts>.txt          summary per book + samples
//   11_catalog_rows_<slug>_<ts>.csv    every parsed row
//   11_catalog_missing_vehicles_<ts>.csv  code-years the books name that hdchop lacks
//
//   node scripts/etl/11_catalog_books.mjs                    (every book with an OCR cache)
//   node scripts/etl/11_catalog_books.mjs 1942-wla 1950-45ci

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { BOOKS, bookBySlug, ocrDir } from '../catalog/books.mjs';
import { parsePage, suffixYear } from '../catalog/parse.mjs';

const source = new pg.Pool({ connectionString: process.env.SOURCE_DATABASE_URL });
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

// --vehicles-from reports/01_vehicles_<ts>.json: check against 01's proposed
// vehicles instead of the vehicles table (preview before 01 is applied).
const vfArg = process.argv.indexOf('--vehicles-from');
const VEHICLES_FROM = vfArg > -1 ? process.argv[vfArg + 1] : null;
const slugs = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--vehicles-from');
const books = (slugs.length ? slugs.map(bookBySlug) : BOOKS).filter((b) => b && b.layout !== 'manual' && fs.existsSync(path.join(ocrDir(b), 'book.json')));
const norm = (p) => p.toUpperCase().replace(/-/g, '');
const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const liveVehicles = (await app.query('SELECT vehicle_id, year, model_code, platform, engine FROM vehicles')).rows;
const liveId = new Map(liveVehicles.map((v) => [`${v.year}|${v.model_code}`, v.vehicle_id]));
// Proposed vehicles not in the table get negative ids (no existing fitment).
const vehicles = VEHICLES_FROM
  ? JSON.parse(fs.readFileSync(VEHICLES_FROM, 'utf8')).map((v, i) => ({ ...v, vehicle_id: liveId.get(`${v.year}|${v.model_code}`) ?? -1 - i }))
  : liveVehicles;
const vehicleOf = new Map(vehicles.map((v) => [`${v.year}|${v.model_code}`, v]));
const vehicleCodes = new Set(vehicles.map((v) => v.model_code));
const known = new Set((await app.query('SELECT oem_number FROM oem_parts')).rows.map((r) => r.oem_number));

const out = [`11_catalog_books — DRY RUN — ${new Date().toISOString()}`, `hdchop: ${vehicles.length} vehicles, ${known.size} parts`, ''];
const missingVehicles = new Map(); // code|year -> { book, rows }

for (const b of books) {
  const dir = ocrDir(b);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'book.json'), 'utf8'));
  const rows = [];
  let pagesWithRows = 0;
  for (let p = 1; p <= meta.pages; p++) {
    const f = path.join(dir, `p${String(p).padStart(3, '0')}`);
    if (!fs.existsSync(`${f}.txt`)) continue;
    const tsv = fs.existsSync(`${f}.tsv`) ? fs.readFileSync(`${f}.tsv`, 'utf8') : null;
    const r = parsePage(b, p, fs.readFileSync(`${f}.txt`, 'utf8'), tsv);
    if (r.length) pagesWithRows++;
    rows.push(...r);
  }

  // Already extracted by Stinkin' from this book (hd_oem_catalog_reference).
  const prev = new Set(
    (await source.query(`SELECT DISTINCT part_number FROM hd_oem_catalog_reference WHERE source_document_title = $1`, [b.title.replace(/,.*$/, '')]))
      .rows.map((r) => norm(r.part_number ?? ''))
  );

  // Codes the book names per year (for "All Models").
  const named = new Map();
  for (const r of rows) for (const f of r.fits ?? []) if (f.code !== '*ALL*') for (const y of f.years) (named.get(y) ?? named.set(y, new Set()).get(y)).add(f.code);
  const bookCodes = new Set([...named.values()].flatMap((s) => [...s]));
  const allModels = (y) => {
    const s = new Set(named.get(y) ?? []);
    for (const v of vehicles) if (v.year === y && bookCodes.has(v.model_code)) s.add(v.model_code);
    return [...s];
  };

  // "Big Twins" in the Shovelhead engine book = that year's Shovelhead big twins (no Evo:
  // 1984 counts only bikes marked shovelhead; Sportsters and Softails never).
  const shovelModels = (y) =>
    y < 1966 || y > 1984 ? [] : vehicles.filter((v) => v.year === y && ['fl', 'fx', 'fxr', 'touring'].includes(v.platform) && (v.engine === 'shovelhead' || (y < 1984 && v.engine == null))).map((v) => v.model_code);

  // Existing fitment pairs for the book's bikes, to count what's new.
  const ids = vehicles.filter((v) => v.year >= b.from && v.year <= b.to).map((v) => v.vehicle_id);
  const have = new Set((await app.query('SELECT oem_number, vehicle_id FROM fitment WHERE vehicle_id = ANY($1)', [ids])).rows.map((r) => `${r.oem_number}|${r.vehicle_id}`));

  const bookParts = new Set(rows.map((r) => r.part));
  const st = { rows: rows.length, clean: 0, flagged: 0, knownPart: 0, prevPart: 0, newPart: 0, suffixLate: 0, pairs: 0, newPairs: 0, lowPairs: 0, noVehicle: 0 };
  const flagCount = {};
  const parts = new Set(), newParts = new Set();
  for (const r of rows) {
    const n = norm(r.part);
    const printed = b.printed ?? b.to;
    const sy = suffixYear(r.part, printed);
    if (sy && sy > printed) r.flags.push('part:suffix_after_book');
    // Old books mark some numbers with "♦", which OCRs as a leading 4 or 9 ("41574-30" for
    // ♦1574-30). Suspect only when the number without that digit is also in the book.
    if (b.to <= 1950 && /^[49]\d{4}/.test(r.part) && bookParts.has(r.part.slice(1))) r.flags.push('part:marker_read_as_digit');
    r.known = known.has(n);
    r.prev = prev.has(n);
    // An OCR repair (lost dash, A read as 4) is accepted only when the repaired number is one
    // we or Stinkin' already have; otherwise the row stays in review.
    if (r.known || r.prev) r.flags = r.flags.filter((f) => f !== 'dash_restored' && f !== 'a_read_as_4');
    r.vehicles = [];
    r.missing = [];
    // A code we have in no year and the book doesn't declare ("FAST", "PREF", "FXAT") is OCR
    // noise or a variant we don't model: the row goes to review.
    for (const f of r.fits ?? []) if (f.code !== '*ALL*' && f.code !== '*SHOVEL*' && !vehicleCodes.has(f.code) && !(b.codes ?? []).includes(f.code)) r.flags.push(`code:unknown:${f.code}`);
    for (const f of r.fits ?? []) {
      for (const y of f.years) {
        const codes = (f.code === '*ALL*' ? allModels(y) : f.code === '*SHOVEL*' ? shovelModels(y) : [f.code]).filter((c) => !f.except?.includes(c));
        for (const c of codes) {
          const v = vehicleOf.get(`${y}|${c}`);
          if (v) r.vehicles.push({ v, low: f.lowYears.includes(y) });
          else {
            r.missing.push(`${y} ${c}`);
            const k = `${c}|${y}`;
            const m = missingVehicles.get(k) ?? missingVehicles.set(k, { code: c, year: y, books: new Set(), rows: 0 }).get(k);
            m.books.add(b.slug); m.rows++;
          }
        }
      }
    }
    for (const f of r.notes ?? []) { const k = `note ${f.replace(/_\d{4}$/, '')}`; flagCount[k] = (flagCount[k] || 0) + 1; }
    for (const f of r.flags) { const k = f.replace(/_\d{4}$/, '').replace(/:bad_code:.*/, ':bad_code').replace(/^code:unknown:.*/, 'code:unknown').replace(/^used_on:word:.*/, 'used_on:word'); flagCount[k] = (flagCount[k] || 0) + 1; }
    if (r.flags.length) { st.flagged++; continue; }
    st.clean++;
    parts.add(n);
    if (r.known) st.knownPart++; else newParts.add(n);
    if (r.prev) st.prevPart++;
    for (const { v, low } of r.vehicles) {
      st.pairs++;
      if (low) st.lowPairs++;
      if (!have.has(`${n}|${v.vehicle_id}`)) st.newPairs++;
    }
    if (!r.vehicles.length && r.missing.length) st.noVehicle++;
  }
  st.newPart = newParts.size;

  const pct = (a, d) => (d ? `${((100 * a) / d).toFixed(1)}%` : '-');
  out.push(`== ${b.slug}  (${b.title}, ${b.from}-${b.to}, layout ${b.layout})`);
  out.push(`pages ${meta.pages}, pages with part rows ${pagesWithRows}`);
  out.push(`rows ${st.rows}: clean ${st.clean} (${pct(st.clean, st.rows)}), flagged for review ${st.flagged}`);
  out.push(`distinct part numbers (clean rows) ${parts.size}: already in hdchop ${parts.size - newParts.size}, new ${newParts.size}; Stinkin' had ${prev.size} numbers from this book`);
  out.push(`fitment pairs (clean rows x existing bikes) ${st.pairs}, not in hdchop yet ${st.newPairs}, early/late-year ${st.lowPairs}`);
  out.push(`clean rows whose bikes don't exist in hdchop ${st.noVehicle}`);
  out.push(`codes named: ${[...bookCodes].sort().join(' ')}`);
  out.push('flags (row goes to review) / notes (row kept, detail):');
  for (const [k, n] of Object.entries(flagCount).sort((a, c) => c[1] - a[1]).slice(0, 15)) out.push(`  ${String(n).padStart(6)}  ${k}`);
  out.push('20 sample clean rows:');
  const clean = rows.filter((r) => !r.flags.length);
  for (let i = 0; i < Math.min(20, clean.length); i++) {
    const r = clean[Math.floor((i * clean.length) / 20)];
    const bikes = [...new Set(r.vehicles.map(({ v }) => v.model_code))].join(',');
    const yrs = r.vehicles.map(({ v }) => v.year);
    out.push(`  p${String(r.page).padStart(3)} ${r.part.padEnd(10)} ${r.known ? 'known' : 'NEW  '} ${r.name.slice(0, 28).padEnd(28)} | ${r.used_raw.slice(0, 40).padEnd(40)} -> ${bikes || '-'} ${yrs.length ? `${Math.min(...yrs)}-${Math.max(...yrs)}` : ''}${r.missing.length ? ` (no bike: ${[...new Set(r.missing.map((m) => m.split(' ')[1]))].join(',')})` : ''}`);
  }
  out.push('');

  const cols = ['page', 'section', 'index', 'part_raw', 'part', 'known', 'prev', 'name', 'used_raw', 'bikes', 'missing', 'flags', 'notes'];
  fs.writeFileSync(
    `reports/11_catalog_rows_${b.slug}_${ts}.csv`,
    [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(
      c === 'bikes' ? r.vehicles.map(({ v, low }) => `${v.year} ${v.model_code}${low ? '~' : ''}`).join('; ')
        : c === 'missing' ? r.missing.join('; ') : c === 'flags' ? r.flags.join(' ') : c === 'notes' ? (r.notes ?? []).join(' ') : r[c]
    )).join(','))].join('\n') + '\n'
  );
}

const mv = [...missingVehicles.values()].sort((a, b) => a.code.localeCompare(b.code) || a.year - b.year);
fs.writeFileSync(`reports/11_catalog_missing_vehicles_${ts}.csv`, ['code,year,rows,books', ...mv.map((m) => `${m.code},${m.year},${m.rows},${[...m.books].join(' ')}`)].join('\n') + '\n');
const byCode = {};
for (const m of mv) (byCode[m.code] ??= []).push(m.year);
out.push(`== bikes the books name that hdchop doesn't have (${mv.length} code-years; not created — vehicles come from 01)`);
for (const [c, ys] of Object.entries(byCode)) out.push(`  ${c.padEnd(8)} ${Math.min(...ys)}-${Math.max(...ys)} (${ys.length} yrs)`);

fs.writeFileSync(`reports/11_catalog_books_${ts}.txt`, out.join('\n') + '\n');
console.log(out.join('\n'));
console.log(`\n→ reports/11_catalog_books_${ts}.txt (+ rows/missing CSVs). Dry run: nothing written to any database.`);
await source.end(); await app.end();
