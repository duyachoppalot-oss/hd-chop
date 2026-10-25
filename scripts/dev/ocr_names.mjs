// scripts/dev/ocr_names.mjs — read-only: part names garbled by OCR, with a drafted fix.
// Words are checked against a vocabulary built from the clean sources (H-D portal
// catalogs = service_catalog, and hydra_glide). A name gets a draft only when every fix
// is safe:
//   glued      "Taillampassembly" -> "Tail lamp assembly" (splits into known words)
//   junk       a trailing stray 1-3 digit / single-letter token ("Lens, tail lamp 5")
//   spelling   one edit from a common known word ("talllamp" -> "taillamp")
// Anything else unknown is listed as "unfixed" for a person to read.
//   node scripts/dev/ocr_names.mjs > reports/out_ocr.txt 2>&1   (dry run: reports/ocr_names_<ts>.csv)
//   node scripts/dev/ocr_names.mjs --apply   adds each draft as an admin rename_part override
//     (reason 'ocr_names <ts>', shown in the admin console); run 08_overrides --apply after.

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const LIST_UNFIXED = process.argv.includes('--list-unfixed'); // for name_review.mjs
const c = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
await c.connect();
const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');

const words = (s) => s.toLowerCase().match(/[a-z]+/g) ?? [];
const freq = new Map();
for (const r of (await c.query(`SELECT description_clean d FROM oem_parts WHERE source IN ('service_catalog', 'hydra_glide') AND description_clean IS NOT NULL`)).rows)
  for (const w of words(r.d)) freq.set(w, (freq.get(w) ?? 0) + 1);
const known = (w) => (freq.get(w) ?? 0) >= 3 || w.length <= 2;
// English words (macOS /usr/share/dict/words) are left alone: "eight", "sight", "keyless" are
// real, not OCR damage. Splits and respellings still only use the parts vocabulary.
const dict = new Set(fs.existsSync('/usr/share/dict/words') ? fs.readFileSync('/usr/share/dict/words', 'utf8').toLowerCase().split('\n') : []);
const plural = (w) => [w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ies$/, 'y'), w.replace(/ed$/, ''), w.replace(/ing$/, '')];
const real = (w) => known(w) || dict.has(w) || plural(w).some((x) => x !== w && (known(x) || dict.has(x)));

// Glued: best split into known words (>= 3 letters each), fewest pieces.
const memo = new Map();
function split(w) {
  if (memo.has(w)) return memo.get(w);
  let best = known(w) && w.length >= 3 ? [w] : null;
  for (let i = 3; i <= w.length - 3; i++) {
    const a = w.slice(0, i);
    if (!known(a) || (freq.get(a) ?? 0) < 10) continue;
    const rest = split(w.slice(i));
    if (rest && (!best || rest.length + 1 < best.length)) best = [a, ...rest];
  }
  memo.set(w, best);
  return best;
}
// One edit (substitute / insert / delete) from a word seen >= 20 times; unique best.
const common = [...freq].filter(([, n]) => n >= 20).map(([w]) => w);
function oneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++e > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return e + (a.length - i) + (b.length - j) <= 1;
}
function dist(a, b) { // Levenshtein, small words only
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// One edit from exactly one parts word, and no other parts word within two edits
// ("mamshaft" is one from camshaft but two from mainshaft: left alone).
function respell(w) {
  if (w.length < 5) return null;
  const c1 = common.filter((x) => oneEdit(w, x));
  if (c1.length !== 1) return null;
  const rivals = [...freq.keys()].filter((x) => x !== c1[0] && (freq.get(x) ?? 0) >= 3 && Math.abs(x.length - w.length) <= 2 && dist(w, x) <= 2);
  return rivals.length ? null : c1[0];
}
const keepCase = (orig, fixed) => (orig[0] === orig[0].toUpperCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed);

const parts = (await c.query(`SELECT p.oem_number, p.oem_display, p.description_clean d, p.source,
  EXISTS (SELECT 1 FROM admin_overrides o WHERE o.kind = 'rename_part' AND o.oem_number = p.oem_number AND o.active) AS renamed
  FROM oem_parts p WHERE p.source IN ('catalog_ocr', 'oem_catalog') AND p.description_clean IS NOT NULL ORDER BY p.oem_display`)).rows;

const fixed = [], unfixed = [];
const kinds = { glued: 0, junk: 0, spelling: 0, abbrev: 0 };
for (const p of parts) {
  if (p.renamed) continue;
  let s = p.d;
  const how = new Set();
  // Trailing junk token(s): stray digits, or 1-3 letters that aren't a parts word ("ese", "ye").
  // Not after a word that takes a number ("Fork, shift 3", "Sprocket, triple row 2"), and not in
  // names carrying a size ("Rear wheel, complete 18"). A short word that starts a parts word is a
  // truncation ("main drive bea"), not junk.
  let t = s;
  const keepsNumber = /\b(shift|gear|row|position|nos?|number|step|stage|speed|size|pin|piece|place|style|link|series)\.?$/i;
  const isJunkWord = (w) => /[aeiou]/.test(w) && !dict.has(w) && !known(w) && w !== 'asm' &&
    ![...freq.keys()].some((k) => k.length > w.length && (k.startsWith(w) || k.endsWith(w))) && !common.some((k) => k.length <= 4 && oneEdit(w, k));
  if (!/wheel|tire|rim|spoke|rotor|disc/i.test(s))
    for (;;) {
      const m = /\s+([a-z0-9]{1,3})[\s.]*$/i.exec(t);
      if (!m) break;
      const w = m[1].toLowerCase(), before = t.slice(0, m.index);
      if (/^\d+$/.test(w) ? keepsNumber.test(before) : !isJunkWord(w)) break;
      t = before;
    }
  if (t !== s && /[a-z]{3}$/i.test(t) && !/\b(and|to|thru|through|or|from|with|includes|&)\s*$/i.test(t)) { s = t; how.add('junk'); }
  // H-D's "asm" / "asm." / "assy" abbreviations, as the portal books spell it out.
  if (/\b(asm|assy)\b\.?/i.test(s)) { s = s.replace(/\b(asm|assy)\b\.?/gi, 'assembly'); how.add('abbrev'); }
  const bad = [];
  s = s.replace(/[A-Za-z]+/g, (tok) => {
    const w = tok.toLowerCase();
    if (real(w) || w.length < 4) return tok;
    const sp = split(w);
    if (sp && sp.length > 1) { how.add('glued'); return keepCase(tok, sp.join(' ')); }
    const r = respell(w);
    if (r) { how.add('spelling'); return keepCase(tok, r); }
    bad.push(tok);
    return tok;
  });
  s = s.replace(/\b([A-Za-z]+)(\s+\1\b)+/gi, '$1'); // "exhaust exhaust"
  // Only drafts whose every word is a parts word: a half-fixed name ("Screw, lame") goes to review.
  const odd = (s.match(/[A-Za-z]+/g) ?? []).filter((w) => w.length > 2 && !known(w.toLowerCase()));
  if (bad.length || odd.length) { unfixed.push({ ...p, bad: [...bad, ...odd] }); continue; }
  if (s !== p.d) { fixed.push({ ...p, to: s, how: [...how].join('+') }); for (const h of how) kinds[h]++; }
}

if (LIST_UNFIXED) { for (const u of unfixed) console.log(`U\t${u.oem_number}\t${u.bad.join(' ')}`); await c.end(); process.exit(0); }
const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const out = `reports/ocr_names_${ts}.csv`;
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(out, ['oem_number,oem_display,source,how,from,to', ...fixed.map((f) => [f.oem_number, f.oem_display, f.source, f.how, f.d, f.to].map(csv).join(','))].join('\n') + '\n');
console.log(`Names checked: ${parts.length} (catalog_ocr + oem_catalog); vocabulary: ${freq.size} words from service_catalog + hydra_glide`);
console.log(`Drafted fixes: ${fixed.length} (glued ${kinds.glued}, trailing junk ${kinds.junk}, spelling ${kinds.spelling}, asm/assy ${kinds.abbrev}) -> ${out}`);
console.log(`Unknown words left alone: ${unfixed.length} names`);
console.log('\nSample fixes:');
for (const f of fixed.filter((_, i) => i % Math.max(1, Math.floor(fixed.length / 60)) === 0).slice(0, 60))
  console.log(`  ${f.oem_display.padEnd(11)} ${f.how.padEnd(14)} ${f.d.slice(0, 45).padEnd(45)} -> ${f.to}`);
console.log('\nSample unfixed (unknown word in [ ]):');
for (const u of unfixed.slice(0, 40)) console.log(`  ${u.oem_display.padEnd(11)} ${u.d.slice(0, 60)}  [${u.bad.join(' ')}]`);
if (APPLY) {
  await c.query('BEGIN');
  const r = await c.query(
    `INSERT INTO admin_overrides (kind, oem_number, value, original, reason)
     SELECT 'rename_part', o, v, f, $4 FROM unnest($1::text[], $2::text[], $3::text[]) AS t(o, v, f)`,
    [fixed.map((f) => f.oem_number), fixed.map((f) => f.to), fixed.map((f) => f.d), `ocr_names ${ts}`]
  );
  await c.query('COMMIT');
  console.log(`\nAdded ${r.rowCount} rename_part overrides (reason 'ocr_names ${ts}'). Run 08_overrides --apply.`);
} else console.log('\nDry run: nothing written.');
await c.end();
