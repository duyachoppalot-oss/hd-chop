// scripts/etl/11_catalog_books.mjs
//
// Reads the OCR page cache of the parts-catalog PDFs (scripts/catalog/ocr.mjs), parses the
// rows (scripts/catalog/parse.mjs) and reports what they would add. Dry run by default.
// Read-only checks against:
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
// --apply (all books only; source = 'catalog_ocr', migration 007), in one transaction:
//   - deletes earlier catalog_ocr fitment and parts (03 and 09 --apply also clear catalog_ocr
//     fitment, so run 11 after them: 01 -> 03 -> 04 -> 09 -> 11 -> 05 -> 06 -> 07 -> 08)
//   - adds part numbers from clean rows that oem_parts lacks (number_source 'extracted',
//     description_clean = cleanDescription of the OCR'd name, chain_root self; 05/06 do the rest)
//   - adds (part, bike, conditions) pairs from clean rows that no other source has for that
//     part and bike. Confidence medium, low for early/late years. Conditions: the Shovelhead
//     engine book's 1340/1200 ("80ci"/"74ci", condition_source catalog_text), else none.
//     source_ref = 'catalog_ocr:<book>:p<page>'.
//
//   node scripts/etl/11_catalog_books.mjs                    (every book with an OCR cache)
//   node scripts/etl/11_catalog_books.mjs 1942-wla 1950-45ci
//   node scripts/etl/11_catalog_books.mjs --apply

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { BOOKS, bookBySlug, ocrDir } from '../catalog/books.mjs';
import { parsePage, suffixYear } from '../catalog/parse.mjs';
import { cleanDescription } from './lib/parts.mjs';

const source = new pg.Pool({ connectionString: process.env.SOURCE_DATABASE_URL });
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

// --vehicles-from reports/01_vehicles_<ts>.json: check against 01's proposed
// vehicles instead of the vehicles table (preview before 01 is applied).
const vfArg = process.argv.indexOf('--vehicles-from');
const VEHICLES_FROM = vfArg > -1 ? process.argv[vfArg + 1] : null;
const APPLY = process.argv.includes('--apply');
const slugs = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--vehicles-from');
if (APPLY && (VEHICLES_FROM || slugs.length)) {
  console.error('--apply loads every book against the live vehicles table: drop --vehicles-from and book names.');
  process.exit(1);
}
const BATCH = 20000;
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
// Parts an earlier --apply added are this script's own: they count as new (and are rewritten).
const known = new Set((await app.query(`SELECT oem_number FROM oem_parts WHERE source <> 'catalog_ocr'`)).rows.map((r) => r.oem_number));

// What --apply would write: new parts and (part, bike, conditions) pairs, best confidence.
const loadParts = new Map(); // oem_number -> { display, names: Map(name -> n) }
const loadPairs = new Map(); // "oem|vehicle_id|cond" -> { conf, ref, book }
const RANK = { medium: 0, low: 1 };
// OCR'd names can run into the dot leader ("WASHER, succliicessssssceccese..."): cut at the
// first word with a letter tripled or a long run without vowels, then clean as 02/09 do.
const JUNK_WORD = (w) => {
  const l = w.replace(/[^a-z]/gi, '');
  return /([a-z])\1\1/i.test(l) || (l.length >= 9 && (l.match(/[aeiouy]/gi) ?? []).length / l.length < 0.25);
};
const partName = (raw) => {
  const words = String(raw ?? '').split(/\s+/);
  const cut = words.findIndex(JUNK_WORD);
  return cleanDescription((cut === -1 ? words : words.slice(0, cut)).join(' '));
};

const out = [`11_catalog_books — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`, `hdchop: ${vehicles.length} vehicles, ${known.size} parts`, ''];
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
  for (const r of rows) for (const f of r.fits ?? []) if (!/^\*.*\*$/.test(f.code)) for (const y of f.years) (named.get(y) ?? named.set(y, new Set()).get(y)).add(f.code);
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

  // Shovelhead engine book "FX" = that year's FX-frame Shovel bikes (books.mjs yearCode).
  const fxFamily = (y) => shovelModels(y).filter((c) => vehicleOf.get(`${y}|${c}`)?.platform === 'fx');

  // Existing fitment pairs for the book's bikes, to count what's new.
  const ids = vehicles.filter((v) => v.year >= b.from && v.year <= b.to).map((v) => v.vehicle_id);
  // (catalog_ocr rows are this script's own, replaced on --apply.)
  const have = new Set((await app.query(`SELECT oem_number, vehicle_id FROM fitment WHERE vehicle_id = ANY($1) AND source <> 'catalog_ocr'`, [ids])).rows.map((r) => `${r.oem_number}|${r.vehicle_id}`));

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
    // XL book: a single year after 1956 next to KH ("70 - KH, XL, XLH, XLCH") is a misread
    // "54 to *" (the K models ended in 1956), so its years can't be trusted.
    if (b.slug === '1954-78-xl' && /(?:^|;\s*)(?:early |late )?(5[7-9]|[6-7]\d)\s*-\s*KH\b/i.test(r.used_raw)) r.flags.push('used_on:kh_after_1956');
    r.known = known.has(n);
    r.prev = prev.has(n);
    // An OCR repair (lost dash, A read as 4) is accepted only when the repaired number is one
    // we or Stinkin' already have; otherwise the row stays in review.
    if (r.known || r.prev) r.flags = r.flags.filter((f) => f !== 'dash_restored' && f !== 'a_read_as_4');
    r.vehicles = [];
    r.missing = [];
    // A code we have in no year and the book doesn't declare ("FAST", "PREF", "FXAT") is OCR
    // noise or a variant we don't model: the row goes to review.
    for (const f of r.fits ?? []) if (!/^\*.*\*$/.test(f.code) && !vehicleCodes.has(f.code) && !(b.codes ?? []).includes(f.code)) r.flags.push(`code:unknown:${f.code}`);
    for (const f of r.fits ?? []) {
      for (const y of f.years) {
        const codes = (f.code === '*ALL*' ? allModels(y) : f.code === '*SHOVEL*' ? shovelModels(y) : f.code === '*FXFAM*' ? fxFamily(y) : [f.code]).filter((c) => !f.except?.includes(c));
        for (const c of codes) {
          const v = vehicleOf.get(`${y}|${c}`);
          if (v) r.vehicles.push({ v, low: f.lowYears.includes(y), cond: f.cond ?? null });
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
    for (const { v, low, cond } of r.vehicles) {
      st.pairs++;
      if (low) st.lowPairs++;
      if (have.has(`${n}|${v.vehicle_id}`)) continue;
      st.newPairs++;
      const k = `${n}|${v.vehicle_id}|${cond ?? ''}`;
      const e = { conf: low ? 'low' : 'medium', ref: `catalog_ocr:${b.slug}:p${r.page}`, book: b.slug };
      const cur = loadPairs.get(k);
      if (!cur || RANK[e.conf] < RANK[cur.conf]) loadPairs.set(k, e);
    }
    if (!r.known && r.vehicles.some(({ v }) => !have.has(`${n}|${v.vehicle_id}`))) {
      const p = loadParts.get(n) ?? loadParts.set(n, { display: r.part, names: new Map() }).get(n);
      const name = partName(r.name);
      if (name) p.names.set(name, (p.names.get(name) ?? 0) + 1);
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

// ---- load summary ----
const pairs = [...loadPairs].map(([k, e]) => { const [o, v, c] = k.split('|'); return { o, v: Number(v), c, ...e }; });
const livePairs = pairs.filter((p) => p.v > 0);
// Parts are written only when a pair on a live bike needs them.
const neededParts = new Set(livePairs.map((p) => p.o));
const partRows = [...loadParts].filter(([o]) => (VEHICLES_FROM ? true : neededParts.has(o))).map(([o, p]) => ({
  o, display: p.display, name: [...p.names].sort((a, c) => c[1] - a[1])[0]?.[0] ?? null,
}));
const byBook = {};
for (const p of pairs) {
  const s = (byBook[p.book] ??= { pairs: 0, onProposed: 0, low: 0, cond: 0, bikes: new Set() });
  s.pairs++; if (p.v < 0) s.onProposed++; if (p.conf === 'low') s.low++; if (p.c) s.cond++; s.bikes.add(p.v);
}
const existing = (await app.query(`SELECT (SELECT count(*) FROM fitment WHERE source = 'catalog_ocr')::int f, (SELECT count(*) FROM oem_parts WHERE source = 'catalog_ocr')::int p`)).rows[0];
out.push('');
out.push(`== load (source = 'catalog_ocr'): ${pairs.length} new (part, bike) rows${VEHICLES_FROM ? `, ${pairs.length - livePairs.length} of them on bikes 01 proposes (not in the table yet)` : ''}; ${partRows.length} new part numbers (${partRows.filter((p) => p.name).length} with a name)`);
out.push(`   replaces ${existing.f} catalog_ocr fitment rows and ${existing.p} catalog_ocr parts in the table now`);
for (const [bk, s] of Object.entries(byBook)) out.push(`  ${bk.padEnd(22)} ${String(s.pairs).padStart(7)} rows, ${String(s.bikes.size).padStart(4)} bikes, low ${s.low}, 74/80ci ${s.cond}${VEHICLES_FROM ? `, on proposed bikes ${s.onProposed}` : ''}`);
out.push('  sample new parts:');
for (const p of partRows.filter((_, i) => i % Math.max(1, Math.floor(partRows.length / 15)) === 0).slice(0, 15)) out.push(`    ${p.display.padEnd(12)} ${p.name ?? '(no name)'}`);

fs.writeFileSync(`reports/11_catalog_books_${ts}.txt`, out.join('\n') + '\n');
console.log(out.join('\n'));
console.log(`\n→ reports/11_catalog_books_${ts}.txt (+ rows/missing CSVs).`);

if (APPLY) {
  const ok = (await app.query(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'oem_parts_source_check'`)).rows[0]?.d ?? '';
  if (!ok.includes('catalog_ocr')) throw new Error('oem_parts.source does not allow catalog_ocr: apply packages/db/migrations/007_catalog_ocr_source.sql first.');
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    const delFit = await client.query(`DELETE FROM fitment WHERE source = 'catalog_ocr'`);
    // Admin rows on catalog_ocr parts would block the part delete; 08 re-adds them.
    await client.query(`DELETE FROM fitment WHERE source = 'admin' AND oem_number IN (SELECT oem_number FROM oem_parts WHERE source = 'catalog_ocr')`);
    const delParts = await client.query(`DELETE FROM oem_parts WHERE source = 'catalog_ocr' AND oem_number NOT IN (SELECT oem_number FROM fitment)`);
    const insParts = await client.query(
      `INSERT INTO oem_parts (oem_number, oem_display, description_clean, chain_root, number_source, source)
       SELECT n, d, c, n, 'extracted', 'catalog_ocr' FROM unnest($1::text[], $2::text[], $3::text[]) AS t(n, d, c)
       ON CONFLICT (oem_number) DO NOTHING`,
      [partRows.map((p) => p.o), partRows.map((p) => p.display), partRows.map((p) => p.name)]
    );
    let inserted = 0;
    for (let i = 0; i < livePairs.length; i += BATCH) {
      const chunk = livePairs.slice(i, i + BATCH);
      const res = await client.query(
        `INSERT INTO fitment (oem_number, vehicle_id, conditions, condition_source, source, source_ref, confidence)
         SELECT o, v, CASE WHEN c = '' THEN '{}'::text[] ELSE ARRAY[c] END, CASE WHEN c = '' THEN 'none' ELSE 'catalog_text' END, 'catalog_ocr', r, cf
         FROM unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::text[]) AS t(o, v, c, r, cf)
         ON CONFLICT DO NOTHING`,
        [chunk.map((p) => p.o), chunk.map((p) => p.v), chunk.map((p) => p.c), chunk.map((p) => p.ref), chunk.map((p) => p.conf)]
      );
      inserted += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`Deleted ${delFit.rowCount} catalog_ocr fitment rows and ${delParts.rowCount} catalog_ocr parts; inserted ${insParts.rowCount} parts and ${inserted} fitment rows (source = 'catalog_ocr').`);
    console.log('Next: 05 --apply, 06 --apply, 07 --max-hole 3 --apply, 08 --apply (refreshes fitment_spans).');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
} else console.log('Dry run: nothing written. --apply loads every book (after migration 007).');
await source.end(); await app.end();
