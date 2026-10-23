// scripts/etl/lib/parts.mjs
//
// Part-number classification, normalization, truncation repair and
// description cleaning for hd_oem_catalog_reference. Shared by 02_parts
// (builds oem_parts) and 03_fitment (needs the same row -> number mapping).

// Formats seen in hd_oem_catalog_reference.part_number (discovery, 2026-10-23).
// Checked in order after uppercasing, trimming and collapsing "--" to "-".
const FORMATS = [
  // valid
  ['std', /^\d{5}-\d{2}[A-Z]{0,3}$/],                  // 13304-05, 00476-90A, 25471-97YA
  ['modern', /^\d{8}[A-Z]{0,4}$/],                      // 61300557, 29200041BYM (color suffix)
  ['hardware', /^[1-9]\d{3,4}[A-Z]?$/],                 // 1039, 7643W, 11686
  // repairable
  ['truncated', /^\d{4,5}-\d?$/],                       // 61586-, 68163-8
  ['ocr_suffix', /^\d{5}-\d{2}\d$/],                    // 31506-798 = 31506-79B with B read as 8
  // 2-4 digit base: almost never in oem_fitment (9 of ~2,400), and samples
  // read as 5-digit numbers missing their front digits (2004 "356-03 FUEL
  // TANK"). Valid only when oem_fitment confirms; else repaired by tail.
  ['short_base', /^\d{2,4}-\d{2}[A-Z]{0,3}$/],          // 68-08, 356-03, 0287-81, 5622-79B
];

export function classify(raw) {
  if (raw == null) return { cls: 'junk', display: null };
  const display = String(raw).toUpperCase().trim().replace(/-{2,}/g, '-');
  for (const [cls, re] of FORMATS) if (re.test(display)) return { cls, display };
  return { cls: 'junk', display };
}

// oem_parts.oem_number: uppercase, no dashes/spaces.
export function normalize(display) {
  return display.toUpperCase().replace(/[\s-]/g, '');
}

// Century-aware intro year from the "-YY" suffix (CLAUDE.md): 3-4 digit base
// is always 19XX; 5+ digit base: 00-26 = 20XX, 27-99 = 19XX.
export function suffixYear(display) {
  const m = /^(\d+)-(\d{2})/.exec(display);
  if (!m) return null;
  const yy = Number(m[2]);
  if (m[1].length <= 4) return 1900 + yy;
  return yy <= 26 ? 2000 + yy : 1900 + yy;
}

// Prefix a repair candidate must start with, plus the suffix shape it needs.
export function repairPrefix(cls, display) {
  if (cls === 'truncated') return { prefix: display, needLetter: false };
  if (cls === 'ocr_suffix') return { prefix: display.slice(0, -1), needLetter: true };
  return null;
}

// Dictionary of full std numbers -> set of catalog years they appear in.
// rows: [{ display, year_start, year_end }] from both source tables.
export function buildDictionary(rows) {
  const years = new Map();
  for (const r of rows) {
    const { cls, display } = classify(r.display);
    if (cls !== 'std' || r.year_start == null) continue;
    let s = years.get(display);
    if (!s) years.set(display, (s = new Set()));
    for (let y = r.year_start; y <= (r.year_end ?? r.year_start); y++) s.add(y);
  }
  // Index by base (prefix repairs) and by "-YY..." suffix (tail repairs).
  const byBase = new Map();
  const bySuffix = new Map();
  for (const d of years.keys()) {
    const i = d.indexOf('-');
    const [base, suffix] = [d.slice(0, i), d.slice(i)];
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(d);
    if (!bySuffix.has(suffix)) bySuffix.set(suffix, []);
    bySuffix.get(suffix).push(d);
  }
  return { years, byBase, bySuffix };
}

// Repair one truncated/ocr/short_base row. Returns { outcome, display?, candidates }.
// outcome: repaired_same_year | repaired_other_year | ambiguous_same_year |
//          ambiguous_other_year | no_candidate | name_mismatch | name_unverified
// name = { head, heads }: the row's part-name head word and display -> Set of
// head words seen for each full number. Candidates whose known names don't
// share the row's head word are dropped (name agreement was only 82-92% per
// repair class without this). Tail repairs (short_base) match on a few digits,
// so they need a known, matching name; prefix repairs only drop on a mismatch.
export function repair(dict, cls, display, yearStart, yearEnd, name = null) {
  const end = yearEnd ?? yearStart;
  let pool;
  if (cls === 'short_base') {
    const i = display.indexOf('-');
    const [shortBase, suffix] = [display.slice(0, i), display.slice(i)];
    pool = (dict.bySuffix.get(suffix) || []).filter((d) => d.slice(0, d.indexOf('-')).endsWith(shortBase));
  } else {
    const { prefix, needLetter } = repairPrefix(cls, display);
    const base = prefix.slice(0, prefix.indexOf('-'));
    pool = (dict.byBase.get(base) || []).filter(
      (d) => d.startsWith(prefix) && d !== prefix && (!needLetter || /^[A-Z]/.test(d.slice(prefix.length)))
    );
  }
  let all = pool.filter((d) => {
    const intro = suffixYear(d);
    return intro == null || end == null || intro <= end; // can't be in a catalog older than its number
  });
  if (name) {
    const strict = cls === 'short_base';
    if (!name.head) {
      if (strict && all.length) return { outcome: 'name_unverified', candidates: all };
    } else {
      const named = all.filter((d) => (name.heads.has(d) ? name.heads.get(d).has(name.head) : !strict));
      if (all.length && !named.length) return { outcome: 'name_mismatch', candidates: all };
      all = named;
    }
  }
  const same = all.filter((d) => {
    const ys = dict.years.get(d);
    for (let y = yearStart; y <= end; y++) if (ys.has(y)) return true;
    return false;
  });
  if (same.length === 1) return { outcome: 'repaired_same_year', display: same[0], candidates: same };
  if (same.length > 1) return { outcome: 'ambiguous_same_year', candidates: same };
  if (all.length === 1) return { outcome: 'repaired_other_year', display: all[0], candidates: all };
  if (all.length > 1) return { outcome: 'ambiguous_other_year', candidates: all };
  return { outcome: 'no_candidate', candidates: [] };
}

// Short part name written by us (DATA_RIGHTS): head noun + at most one
// qualifier, no quantities, notes, colors or part numbers. null if the text
// is an extraction fragment.
const PART_NO = /\b\d{4,5}-\d{2}[A-Z]{0,3}\b|\b\d{8}[A-Z]{0,4}\b/;
export function cleanDescription(raw) {
  if (!raw) return null;
  // Columns run together with wide gaps; take the first segment that starts like a part name.
  const seg = String(raw).split(/\s{2,}/).map((s) => s.trim()).find((s) => /^[A-Z][A-Z]/.test(s));
  if (!seg) return null;
  let s = seg
    .replace(/[^\x20-\x7E]/g, ' ')                    // bullets, OCR symbols
    .replace(/\bn\/a\b/gi, ' ')
    .replace(/\([^)]*\)|\{[^}]*\}|\[[^\]]*\]/g, ' ')   // (2), (black), (HDI), {4}
    .replace(/[({[].*$/, ' ')                           // unclosed "(14-16 gau"
    .split(',')
    .map((p) =>
      p
        .replace(/(^|\s)(w\/|with\b|used\b|use\b|for\b|incl\b).*$/i, '') // "w/ 72412-97", "with 69202637"
        .replace(/\s-\s.*\d.*$/, '')                                     // "- 11.21 in. long"
        .trim()
    )
    .filter((p) => /[A-Za-z]{2}/.test(p) && !PART_NO.test(p))
    .slice(0, 2)
    .join(', ')
    .replace(/\s+/g, ' ')
    .replace(/[\s\-–:;.,/]+$/, '')
    .trim();
  if (s.length > 60) s = s.slice(0, 60).replace(/[\s,]+\S*$/, '');
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if (s.length < 3 || letters / s.replace(/\s/g, '').length < 0.6) return null;
  s = s.toLowerCase();
  return s[0].toUpperCase() + s.slice(1);
}

export function headWord(raw) {
  const d = cleanDescription(raw);
  return d ? d.toLowerCase().split(/[\s,]/)[0] : null;
}

const YEAR_MIN = 1903;
const YEAR_MAX = 2027;
const validYear = (y) => y != null && y >= YEAR_MIN && y <= YEAR_MAX;
export const yearsOk = (r) =>
  validYear(r.year_start) && validYear(r.year_end ?? r.year_start) && (r.year_end ?? r.year_start) >= r.year_start;

// Row -> part number, exactly as 02_parts builds oem_parts.
// referenceRows: { part_number, description, year_start, year_end }; fitmentRows: { display, year_start, year_end }.
// resolve() returns { cls, display, final, numberSource, outcome, candidates };
// final is null when the row goes to review (outcome = reason).
export function makeResolver(referenceRows, fitmentRows) {
  const dict = buildDictionary([
    ...referenceRows.filter(yearsOk).map((r) => ({ display: r.part_number, year_start: r.year_start, year_end: r.year_end })),
    ...fitmentRows.filter(yearsOk),
  ]);
  const inFitment = new Set(fitmentRows.map((r) => classify(r.display).display));
  const heads = new Map(); // full std number -> head words of its catalog names
  for (const r of referenceRows) {
    const { cls, display } = classify(r.part_number);
    const h = cls === 'std' ? headWord(r.description) : null;
    if (!h) continue;
    if (!heads.has(display)) heads.set(display, new Set());
    heads.get(display).add(h);
  }
  function resolve(r) {
    const { cls, display } = classify(r.part_number);
    const out = { cls, display, final: null, numberSource: null, outcome: null, candidates: [] };
    if (cls === 'std' || cls === 'modern' || cls === 'hardware' || (cls === 'short_base' && inFitment.has(display))) {
      return { ...out, final: display, numberSource: 'extracted', outcome: 'extracted' };
    }
    if (cls === 'truncated' || cls === 'ocr_suffix' || cls === 'short_base') {
      if (!yearsOk(r)) return { ...out, outcome: 'bad_year' };
      const res = repair(dict, cls, display, r.year_start, r.year_end ?? r.year_start, { head: headWord(r.description), heads });
      return res.display
        ? { ...out, final: res.display, numberSource: res.outcome, outcome: res.outcome, candidates: res.candidates }
        : { ...out, outcome: res.outcome, candidates: res.candidates };
    }
    return { ...out, outcome: 'junk_format' };
  }
  return { resolve, dict, inFitment };
}
