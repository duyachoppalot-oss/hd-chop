// scripts/dev/name_review.mjs — read-only: the part names a person has to look at.
// The names ocr_names.mjs couldn't fix safely (rare unknown words) plus renamed names that
// still carry stray characters, sorted by how many bikes each part fits (most-seen first).
// Each row has the vendor name for the same OEM number as a hint (a lead, not proof: vendor
// cross-refs are sometimes off) (stinkin catalog_products /
// pu_catalog / vtwin_catalog; internal review only, DATA_RIGHTS: never shown in the app).
// Fix a name in the admin console (part page -> rename) or fill new_name and hand the file back.
//   node scripts/dev/name_review.mjs   -> reports/name_review_<ts>.csv
//   node scripts/dev/name_review.mjs --import <file.csv> [--apply]
//     rows with new_name filled -> rename_part overrides (reason 'name_review'); dry run lists them.
//     Then run 08_overrides --apply.

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const app = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
const src = new pg.Client({ connectionString: process.env.SOURCE_DATABASE_URL });
await app.connect();
await src.connect();
const IMPORT = process.argv.includes('--import') ? process.argv[process.argv.indexOf('--import') + 1] : null;
if (IMPORT) {
  const { readCsv } = await import('../etl/lib/csv.mjs');
  const rows = readCsv(IMPORT).filter((r) => r.new_name?.trim() && r.new_name.trim() !== r.current_name);
  const parts = (await app.query(`SELECT oem_number, oem_display FROM oem_parts WHERE oem_display = ANY($1)`, [rows.map((r) => r.oem)])).rows;
  const num = new Map(parts.map((p) => [p.oem_display, p.oem_number]));
  const ok = rows.filter((r) => num.has(r.oem));
  for (const r of ok) console.log(`  ${r.oem.padEnd(11)} ${r.current_name.slice(0, 40).padEnd(40)} -> ${r.new_name.trim()}`);
  console.log(`${ok.length} renames${rows.length - ok.length ? `; ${rows.length - ok.length} OEM numbers not found` : ''}.`);
  if (process.argv.includes('--apply') && ok.length) {
    const r = await app.query(
      `INSERT INTO admin_overrides (kind, oem_number, value, original, reason)
       SELECT 'rename_part', o, v, f, 'name_review' FROM unnest($1::text[], $2::text[], $3::text[]) AS t(o, v, f)`,
      [ok.map((r) => num.get(r.oem)), ok.map((r) => r.new_name.trim()), ok.map((r) => r.current_name)]
    );
    console.log(`Added ${r.rowCount} rename_part overrides. Run 08_overrides --apply.`);
  } else console.log('Dry run: nothing written.');
  await app.end();
  await src.end();
  process.exit(0);
}
const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');

// Unfixed names come from ocr_names' own rules (dry run, its "unfixed" list).
const out = execFileSync('node', ['scripts/dev/ocr_names.mjs', '--list-unfixed'], { encoding: 'utf8', maxBuffer: 64 << 20 });
const unfixed = new Map(out.split('\n').filter((l) => l.startsWith('U\t')).map((l) => { const [, o, w] = l.split('\t'); return [o, w]; }));

const rows = (await app.query(
  `SELECT p.oem_number, p.oem_display, p.description_clean AS name, p.source, pc.display_name AS concept,
          count(DISTINCT f.vehicle_id)::int AS bikes, min(v.year) AS y0, max(v.year) AS y1,
          (SELECT string_agg(DISTINCT v2.model_code, ' ') FROM fitment f2 JOIN vehicles v2 USING (vehicle_id) WHERE f2.oem_number = p.oem_number) AS models,
          EXISTS (SELECT 1 FROM admin_overrides o WHERE o.kind = 'rename_part' AND o.oem_number = p.oem_number AND o.active) AS renamed
   FROM oem_parts p LEFT JOIN part_concepts pc USING (concept_id)
   LEFT JOIN fitment f USING (oem_number) LEFT JOIN vehicles v USING (vehicle_id)
   WHERE p.source IN ('catalog_ocr', 'oem_catalog') GROUP BY 1, 2, 3, 4, 5`
)).rows;

// A word is damage only if it's rare: not an English word and in fewer than 3 part names in all
// sources ("Jamnut", "anchored", "4-place" are real H-D wording; "guapg", "cxnaust" are not).
const dict = new Set(fs.existsSync('/usr/share/dict/words') ? fs.readFileSync('/usr/share/dict/words', 'utf8').toLowerCase().split('\n') : []);
const seen = new Map();
for (const r of (await app.query(`SELECT lower(description_clean) d FROM oem_parts WHERE description_clean IS NOT NULL`)).rows)
  for (const w of new Set(r.d.match(/[a-z]+/g) ?? [])) seen.set(w, (seen.get(w) ?? 0) + 1);
// Catalog shorthand and model codes aren't damage.
const ABBR = new Set(['int', 'exh', 'brg', 'brkt', 'throt', 'tps', 'abs', 'dvd', 'std', 'sec', 'asm', 'assy', 'cpt', 'hd', 'lh', 'rh', 'w', 'wo']);
const codes = new Set((await app.query(`SELECT DISTINCT lower(model_code) c FROM vehicles`)).rows.map((r) => r.c));
const stem = (w) => [w, w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ed$/, ''), w.replace(/ing$/, '')];
for (const [o, ws] of unfixed) {
  const rare = ws.split(' ').filter((w) => { const l = w.toLowerCase(); return !ABBR.has(l) && !codes.has(l) && !stem(l).some((x) => dict.has(x)) && (seen.get(l) ?? 0) < 3; });
  if (rare.length) unfixed.set(o, rare.join(' ')); else unfixed.delete(o);
}

// Renamed but still odd: stray punctuation, a lone letter, a repeated phrase.
const leftover = (s) => /[!~?{}|]|--|\s[b-hj-z]\s|(\b\w{4,}\b).*\b\1\b/i.test(s);
const review = rows
  .filter((r) => unfixed.has(r.oem_number) || (r.renamed && leftover(r.name)))
  .map((r) => ({ ...r, why: unfixed.has(r.oem_number) ? `unknown: ${unfixed.get(r.oem_number)}` : 'renamed, still odd' }))
  .sort((a, b) => b.bikes - a.bikes || a.oem_display.localeCompare(b.oem_display));

// Vendor hint by OEM number.
const hint = new Map();
const nums = review.map((r) => r.oem_display.replace(/[A-Z]+$/, ''));
for (const [sql] of [
  [`SELECT oem_part_number AS o, name FROM catalog_products WHERE oem_part_number = ANY($1)`],
  [`SELECT oem_part_number AS o, name FROM pu_catalog WHERE oem_part_number = ANY($1)`],
]) for (const r of (await src.query(sql, [nums])).rows) if (!hint.has(r.o)) hint.set(r.o, r.name);

const csv = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const file = `reports/name_review_${ts}.csv`;
fs.writeFileSync(file, ['priority,oem,current_name,new_name,why,vendor_hint,concept,bikes,years,models',
  ...review.map((r, i) => [i + 1, r.oem_display, r.name, '', r.why, hint.get(r.oem_display.replace(/[A-Z]+$/, '')) ?? '', r.concept ?? '', r.bikes,
    r.y0 ? `${r.y0}-${r.y1}` : '', (r.models ?? '').slice(0, 60)].map(csv).join(','))].join('\n') + '\n');
console.log(`To review: ${review.length} names (${review.filter((r) => r.why !== 'renamed, still odd').length} unfixed, ${review.filter((r) => r.why === 'renamed, still odd').length} renamed but still odd); with a vendor hint: ${review.filter((r) => hint.has(r.oem_display.replace(/[A-Z]+$/, ''))).length}; on no bike: ${review.filter((r) => !r.bikes).length}`);
console.log(`-> ${file}\n\nTop 40:`);
for (const r of review.slice(0, 40)) console.log(`  ${String(r.bikes).padStart(4)} bikes  ${r.oem_display.padEnd(11)} ${r.name.slice(0, 44).padEnd(44)} ${(hint.get(r.oem_display.replace(/[A-Z]+$/, '')) ?? '').slice(0, 40)}`);
await app.end();
await src.end();
