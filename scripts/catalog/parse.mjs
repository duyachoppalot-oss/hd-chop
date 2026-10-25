// Turns OCR'd catalog pages into part rows. Pure functions, no I/O.
// parsePage(book, pageNo, text) -> [{ page, section, index, part_raw, part, name, used_raw, fits, flags }]
//   fits: [{ code, years: [y...], low: bool }]  (low = "early/late" boundary year, partial)
//   flags: OCR/format problems; a row with flags goes to review, not to fitment.
// Layouts:
//   hd     1971-86 H-D books: INDEX PART NAME ..... USED ON  ("84 to * - FXST; 85 to * - FXWG")
//   hd1950 1950 spare parts: PART NAME .... PRICE--YEARS ..... codeword ("1941 to 1950", "1949 & 1950")
//   wla    1942 WLA list: PART NAME .... MFG  qty40 qty41 qty42 per100

import { parseUsedOn, splitUsedOn, twoDigitYear } from '../etl/lib/usedon.mjs';

// ---------- shared ----------

const DASHES = /[‐-―−~]+|-{2,}|—/g;
const clean = (s) => s.replace(/[|¦]/g, ' ').replace(DASHES, '-').replace(/\s+/g, ' ').trim();

// H-D number: 3-5 digit base, optional -YY, optional letters (4336W, 6443HW, 33055-78A, 1409-41M, 0133).
const PART = /^(\d{3,5})(?:-(\d{2}))?([A-Z]{0,3})$/;

// OCR repairs on a part token. Returns { part, flag } or null when it isn't a part number.
export function readPart(tok) {
  let t = tok.toUpperCase().replace(/[.,:;]+$/, '').replace(/^[^0-9]+/, '');
  t = t.replace(/(\d)-+-?(\d)/g, '$1-$2');
  let m = PART.exec(t);
  if (m) return { part: t, flag: null };
  // "3307880" -> 33078-80 (dash lost): 7 digits, maybe letters.
  m = /^(\d{5})(\d{2})([A-Z]{0,3})$/.exec(t);
  if (m) return { part: `${m[1]}-${m[2]}${m[3]}`, flag: 'dash_restored' };
  // "2484-414" -> 2484-41A: no H-D suffix has three digits; OCR reads A as 4.
  m = /^(\d{3,5})-(\d{2})4([A-Z]{0,2})$/.exec(t);
  if (m) return { part: `${m[1]}-${m[2]}A${m[3]}`, flag: 'a_read_as_4' };
  return null;
}

// Intro year of the number's suffix (century rule, CLAUDE.md); null for hardware numbers.
// In a book printed before 2000, a 20XX reading is the 19XX number (26348-15 = 1915).
export function suffixYear(part, bookTo = 9999) {
  const m = PART.exec(part);
  if (!m || !m[2]) return null;
  const y = m[1].length <= 4 ? 1900 + Number(m[2]) : twoDigitYear(m[2]);
  return y > bookTo && y >= 2000 ? y - 100 : y;
}

// ---------- hd layout ----------

// OCR slips inside USED ON: "t0", "ta", "te", "10" for "to"; "7110 *" for "71 to *".
function fixUsedOn(s) {
  return s
    .replace(/\b(\d{2})(?:t[o0aec]|10)\s*(\*|\d{2})\b/gi, '$1 to $2')
    .replace(/\b(\d{2})\s+(?:t[o0aec]|1[0o])\s*(\*|\d{2}|\.\.|')/gi, '$1 to $2')
    .replace(/\b(\d{2}) and ((?:early |late )?\d{2})\b/gi, '$1 & $2') // "79 and 80" (1979-85 XL book)
    .replace(/\bto\s*(?:\.\.|\*+|')/gi, 'to *')
    .replace(/\bto\s*(?=-)/gi, 'to * ') // missing star: 86 to - FXRD
    .replace(/(\d{2})'\s*t[a0o]\b/gi, '$1 to')
    .replace(/\b(?:A[il1]{2}|AII|AN)\s+M[o0]d[eo][il1l]s\b(?:\s*[._'a-z]{1,3}(?=\s*(?:;|$)))?\.?/gi, 'All Models') // "All Models ." / "_" / "oo" (dot leader)
    .replace(/\bto\s*[•·]/g, 'to *')
    .replace(/:\s*(?=(?:early |late )?\d{2}\s*(?:to|&|-))/gi, '; ') // ":" read for ";"
    .replace(/\s*-\s*(?:-\s*)+/g, ' - ')                             // "- -"
    .replace(/\bP(?=X[A-Z]{0,6}\b|L[A-Z]{1,6}\b)/g, 'F')                // "PXRS" = FXRS (no H-D code starts with P)
    .replace(/\bFI\b/g, 'FL')                                          // "FI, FLH"
    .replace(/\b(F[LX][A-Z0-9-]{0,6})\.\s+(?=F[LX]|C[a-z]*ssic\b)/gi, '$1, ') // "FL. FLH", "FLH-80. Classic"
    .replace(/\bC[A-Za-z]{0,2}[AaIi]?[A-Za-z]?ss?[A-Za-z]{0,2}c\b|\bC[li1]assic\b/g, 'CLASSIC')
    .replace(/\s+-\s*|\s*-\s+/g, ' - ') // keep "FLH-80" whole
    .replace(/\s+/g, ' ')
    // "84, 85 to * - FXRS" -> "84 - FXRS; 85 to * - FXRS"
    .replace(/((?:early |late )?\d{2}),\s*((?:early |late )?\d{2}(?:\s*(?:to|&)\s*(?:early |late )?(?:\d{2}|\*))?)\s-\s([^;]+)/gi, '$1 - $3; $2 - $3')
    .trim();
}

// "76 t0 *", "7110 79" -> "76 to *", "71 to 79", before looking for where the used-on starts.
const fixYearTo = (s) => s.replace(/\b(\d{2})\s*(?:t[o0aec]|10)\s*(\*|\d{2})\b/gi, '$1 to $2');

const USED_START = /(?:^|\s)((?:early |late )?\d{2}(?:,\s*(?:early |late )?\d{2})*\s*(?:to|&|-)\s*(?:early |late )?(?:\d{2}|\*)?)/i;
// Start of a USED ON cell: "84 to * - ", "84 & Early 85 - ", "Early 84 - ", "86 - ".
const USED_HEAD = /(?<![\d.])(?:early |late )?\d{2}(?:\s*(?:to|&)\s*(?:early |late )?(?:\d{2}|\*))?\s*-\s*(?=[A-Z*])/i;

function resolveHd(book, used) {
  const fits = [];
  const flags = [];
  // Book-specific spellings ("XLH 883/DLX" in the 1986-90 XLH book): books.mjs usedFix.
  if (book.usedFix) used = book.usedFix(used);
  for (let seg of splitUsedOn(used)) {
    // "71 to * - All Models except FXB & FXSB" (1971-84 FX book): All Models minus the listed codes.
    let except = null;
    const ex = /^(.*\bAll Models)\s+except\s+([A-Z0-9 ,&-]+?)[\s.,:;]*$/i.exec(seg);
    if (ex) {
      seg = ex[1];
      except = ex[2].split(/\s*(?:,|&|\band\b)\s*/).filter(Boolean).map((c) => book.code(c.trim().toUpperCase()));
    }
    const p = parseUsedOn(seg);
    if (p.kind !== 'range') { flags.push(`used_on:${p.reason ?? p.kind}`); continue; }
    const to = p.to ?? book.to;
    if (p.from < book.from || to > book.to || p.from > to) { flags.push('used_on:years_outside_book'); continue; }
    const years = [];
    // "84 & 86" is two years, not a range (parseUsedOn reads "&" like "to").
    if (/^\s*(?:early |late )?\d{2}\s*&/i.test(seg)) years.push(...new Set([p.from, to]));
    else for (let y = p.from; y <= to; y++) years.push(y);
    const low = (y) => p.lowYears.includes(y);
    if (p.all) fits.push({ code: '*ALL*', years, lowYears: years.filter(low), ...(except ? { except } : {}) });
    else
      for (const it of p.items) {
        // Year-bounded renames (book.yearCode): split the years by the code they resolve to.
        const byCode = new Map();
        for (const y of years) {
          const c = book.yearCode ? book.yearCode(book.code(it.code), y) : book.code(it.code);
          if (c == null) continue; // model didn't exist that year (yearCode)
          (byCode.get(c) ?? byCode.set(c, []).get(c)).push(y);
        }
        for (const [code, ys] of byCode) fits.push({ code, years: ys, lowYears: ys.filter(low) });
      }
    if (p.bad?.length) flags.push(`used_on:bad_code:${p.bad.join('|')}`);
  }
  return { fits, flags };
}

function parseHd(book, page, lines) {
  const rows = [];
  const section = lines.find((l) => /[A-Z]{4,}/.test(l) && !/RETAIL|INDEX|PRICE/.test(l))?.replace(/\s+[A-Z]{1,3}\d[\d-]*$/, '').slice(0, 80) ?? '';
  let last = null;
  // Two rows printed side by side come out as one OCR line: split where a second
  // "[index] NNNNN-NN NAME" starts after a used-on.
  const SECOND_ROW = /(?<=\b(?:Models?|[A-Z]{2,7}\d{0,3}))[\s;,]+(?=(?:\d{1,3}[A-Z]?\s+)?\d{4,5}\s?-\s?\d{2}[A-Z]{0,2}\s*[=-]?\s*[A-Z]{3,})/;
  const queue = lines.map(clean);
  for (let li = 0; li < queue.length; li++) {
    let line = queue[li];
    const sm = SECOND_ROW.exec(line);
    if (sm && USED_HEAD.test(line.slice(0, sm.index))) {
      queue.splice(li + 1, 0, line.slice(sm.index).replace(/^[\s;,]+/, '').replace(/^((?:\d{1,3}[A-Z]?\s+)?\d{4,5}\s?-\s?\d{2}[A-Z]{0,2})\s*[=-]\s*/, '$1 '));
      line = line.slice(0, sm.index);
    }
    if (!line || /^(RETAIL|PRICE|INDEX)\b/i.test(line)) continue;
    const toks = line.replace(/(\d{4,5}) ?- ?(\d{2}[A-Z]{0,3})\b/, '$1-$2').split(' ');
    // [index] part name ... used-on
    let i = 0, index = null;
    if (/^\d{1,3}[A-Z]?$/.test(toks[0]) && toks[1] && readPart(toks[1])) { index = toks[0]; i = 1; }
    const pr = readPart(toks[i] ?? '');
    // A stray mark between number and name ("16495-78 = REAR", "34525-54 - RETAINER") is OCR noise.
    const restText = toks.slice(pr ? i + 1 : 0).join(' ').replace(pr ? /^[=~-]+\s*/ : /^$/, '');
    if (!pr || !/[A-Za-z]{2}/.test(restText.split(' ')[0] ?? '')) {
      // Continuation of the previous row's USED ON ("77 to 80 - FXS, FXS-80, FXB").
      if (last && USED_START.test(' ' + line) && /^(?:early |late )?\d{2}/i.test(line)) {
        last.used_raw += '; ' + fixUsedOn(line);
      } else if (last && !last.used_raw && !pr) {
        // Wrapped name: the used-on sits on the next line ("0.425 x 0.615 - std. (44) ... 71 to Early 77 - All Models").
        const wm = USED_HEAD.exec(fixYearTo(line));
        if (wm) last.used_raw = fixUsedOn(fixYearTo(line).slice(wm.index));
      }
      continue;
    }
    // Used-on starts at the first "YY [to|&] YY|* - " (or "Early/Late YY - "); the dot leader
    // before it OCRs as junk ("0..0 cece eee"), so the name is cut at the first leader-ish run.
    const body = fixYearTo(restText.replace(/\bN\/A\b/g, ' '));
    let name = body, used = '';
    const m = USED_HEAD.exec(body);
    if (m) { name = body.slice(0, m.index); used = body.slice(m.index); }
    name = name.replace(/\s*(?:[.,'°·•]{2,}|\s[.,'°·•]\s?[.,'°·•]).*$/, '').replace(/[\s.,'°·•]+$/, '');
    last = { page, section, index, part_raw: toks[i], part: pr.part, name: name.trim(), used_raw: fixUsedOn(used), flags: pr.flag ? [pr.flag] : [] };
    rows.push(last);
  }
  for (const r of rows) {
    if (!r.used_raw) { r.fits = []; r.flags.push('used_on:missing'); continue; }
    const { fits, flags } = resolveHd(book, r.used_raw);
    r.fits = fits;
    r.flags.push(...flags);
  }
  return rows;
}

// ---------- hd1950 layout ----------

const YEAR4 = /\b(19[2-5]\d)\b/;

// One 1950 used-on cell -> fits. Segments split on ";" ("1940 & 1941-45 model WLA; 1942-WLC").
// Each segment: years ("1941 to 1950", "1949 & 1950", "Later 1934 to 1950") + an optional
// qualifier that narrows the models: "-Solo", "-Servi-Cars", "-45 model WLA & WLC",
// "-except Servi-cars", "-WLD". "45" = 45 cu in. Anything else ("iron heads") -> review.
const CODES_45 = new Set(['W', 'WL', 'WLA', 'WLC', 'WLD', 'WLDR', 'G', 'GA', 'GD', 'GDT']);
const HARMLESS = new Set(['45', 'MODEL', 'MODELS', 'ONLY', 'AND', '&', 'REAR', 'FRONT', 'LEFT', 'RIGHT']);

function usedOn1950(s, book, defaults) {
  const flags = [];
  const fits = [];
  let qualified = false;
  for (const seg0 of s.split(/;|,\s*(?=(?:early |late |later )?19\d\d)/i)) {
    const t = seg0.replace(/\s+/g, ' ').replace(/\b(\d{4})\s*[.,]?\s*f[o0]\s+(\d{4})/gi, '$1 to $2').replace(/\bto\s*\.\s*/gi, 'to ').replace(/\blater\b/gi, 'late');
    // "19382" (1932? 1938?), "3941", "1980" in a 1950 book: unreadable year, don't guess.
    if (/\b19\d{3,}\b|\b[2-9]9\d\d\b|\b1[0-8]\d{2}\b|\b19[6-9]\d\b/.test(t)) flags.push('used_on:year_garbled');
    const years = new Set();
    const lowYears = new Set();
    let rest = t;
    for (const m of t.matchAll(/(early |late )?(19[2-5]\d)\s*(?:to|-)\s*(early |late )?(19[2-5]\d)/gi)) {
      const a = Number(m[2]), b = Number(m[4]);
      if (b < a) { flags.push('used_on:bad_range'); continue; }
      for (let y = a; y <= b; y++) years.add(y);
      if (m[1]) lowYears.add(a);
      if (m[3]) lowYears.add(b);
      rest = rest.replace(m[0], ' ');
    }
    for (const m of t.matchAll(/(early |late )?(19[2-5]\d)\s*&\s*(early |late )?(19[2-5]\d)/gi)) {
      years.add(Number(m[2])); years.add(Number(m[4]));
      rest = rest.replace(m[0], ' ');
    }
    for (const m of rest.matchAll(/(early |late )?\b(19[2-5]\d)\b/gi)) { years.add(Number(m[2])); if (m[1]) lowYears.add(Number(m[2])); rest = rest.replace(m[0], ' '); }
    if (!years.size) continue;
    for (const y of years) if (y > book.to) flags.push('used_on:years_outside_book');
    // Qualifier -> models: only the "-text" right after the last year, up to the dot leader.
    const lastYear = [...t.matchAll(/19[2-5]\d/g)].pop();
    const tail = lastYear ? t.slice(lastYear.index + 4) : '';
    const qm = /^\s*-+\s*([A-Za-z0-9&'’ ,-]+?)(?=\s*(?:[.]{2}|\.\s+\.|[.]\s*$|$))/.exec(tail);
    const q = (qm?.[1] ?? '').toUpperCase().replace(/WIA/g, 'WLA').replace(/SERVI\s*-?\s*CARS?/g, 'SERVICAR').replace(/[^A-Z0-9&\s]/g, ' ');
    let models = defaults;
    const words = q.split(/\s+/).filter(Boolean);
    if (words.includes('EXCEPT')) {
      if (words.filter((w) => !HARMLESS.has(w)).join(' ') === 'EXCEPT SERVICAR') models = book.solo;
      else flags.push('used_on:qualified');
    } else if (words.length) {
      const codes = words.filter((w) => CODES_45.has(w));
      const other = words.filter((w) => !CODES_45.has(w) && !HARMLESS.has(w) && w !== 'SOLO' && w !== 'SERVICAR');
      if (other.length) flags.push('used_on:qualified');
      if (codes.length) models = codes;
      else if (words.includes('SOLO')) models = book.solo;
      else if (words.includes('SERVICAR')) models = book.servicar;
    }
    if (models !== defaults) qualified = true;
    for (const code of models) fits.push({ code, years: [...years].sort(), lowYears: [...lowYears] });
  }
  if (!fits.length) flags.push('used_on:no_years');
  return { fits, flags, qualified };
}

function parse1950(book, page, lines) {
  const rows = [];
  const servicar = page >= book.servicarPages[0] && page <= book.servicarPages[1];
  const mixed = book.mixedPages.includes(page);
  // NAME .... PRICE--USED ON ..... codeword. Prices OCR badly (".85", "215", "68610"); the
  // used-on starts at the first 4-digit year (or "early"/"late") after "price-". Scan junk
  // after the code word (":", "§", "4") is dropped first.
  const ROW = /^(.*?)[\s.]*\$?\s*[\d.,»«~°]*\d?\s*-\s*((?:early |late |later )?\d{4,5}\b.*?)[\s.,:;°+=~2-]*\b([a-zA-Z]{5})?$/i;
  const trimJunk = (t) => t.replace(/[^A-Za-z0-9)]+$/, '').replace(/(?:\s+\S{1,2})+$/, '').replace(/[^A-Za-z0-9)]+$/, '');
  const section = servicar ? 'servi-car' : mixed ? 'mixed' : '';
  let last = null;
  let pending = null; // row whose name wrapped: years come on the next line
  for (const raw of lines) {
    const line = clean(raw);
    const toks = line.split(' ');
    const pr = readPart(toks[0] ?? '') ?? readPart(toks[1] ?? '');
    const at = pr ? (readPart(toks[0] ?? '') ? 0 : 1) : -1;
    const rest = pr ? toks.slice(at + 1).join(' ') : line;
    if (!pr || !/^[A-Za-z]/.test(rest)) {
      if (pending && /^[A-Za-z(]/.test(line)) {
        const m = ROW.exec(trimJunk(line));
        if (m) {
          Object.assign(pending, { name: `${pending.name} ${m[1].replace(/[.\s]+$/, '')}`, used_raw: m[2], code: !!m[3] });
          pending.flags = pending.flags.filter((f) => f !== 'row:unparsed');
          last = pending;
        }
        pending = null;
        continue;
      }
      // wrapped used-on ("WLC . . . . evhec") or "Consists of" kit lines (component rows, skipped)
      if (last && !last.code && /^[A-Za-z ,&]+[. ]+[a-z]{5}$/.test(line)) { last.used_raw += ' ' + line.replace(/[. ]+[a-z]{5}$/, ''); last.code = true; }
      pending = null;
      continue;
    }
    const m = ROW.exec(trimJunk(rest));
    if (!m) {
      pending = { page, section, part_raw: toks[at], part: pr.part, name: rest.replace(/[.\s]+$/, ''), used_raw: '', flags: ['row:unparsed', ...(pr.flag ? [pr.flag] : [])] };
      rows.push(pending);
      last = null;
      continue;
    }
    pending = null;
    last = { page, section, part_raw: toks[at], part: pr.part, name: m[1].replace(/[.\s]+$/, ''), used_raw: m[2], code: !!m[3], flags: pr.flag ? [pr.flag] : [] };
    rows.push(last);
  }
  // 1940s numbers have a 4-digit base ("2485-12") or are "O-list" hardware starting 0 ("0117").
  // A 3-digit base not starting with 0 is a number whose first digit the scan cut off.
  for (const r of rows) if (/^[1-9]\d{2}(-|$)/.test(r.part)) r.flags.push('part:left_edge_cut');
  for (const r of rows) {
    if (r.flags.includes('row:unparsed')) { r.fits = []; continue; }
    const defaults = r.section === 'servi-car' ? book.servicar : [...book.solo, ...book.servicar];
    const { fits, flags, qualified } = usedOn1950(r.used_raw, book, defaults);
    if (r.section === 'mixed' && !qualified) flags.push('section:mixed_page');
    r.fits = fits;
    r.flags.push(...flags);
    delete r.code;
  }
  return rows;
}

// ---------- wla layout ----------

const QTY = (t) => {
  const s = t.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1');
  return /^\d{1,3}$/.test(s) ? Number(s) : null;
};

function parseWla(book, page, lines) {
  const rows = [];
  for (const raw of lines) {
    const line = clean(raw).replace(/See\s*["'“”]?\s*O\s*["'“”]?\s*list\.?$/i, ' SEE_O');
    const toks = line.split(' ');
    // Part number = first token that reads as one (left margin carries scan junk: "po", "He", "♦").
    let at = -1, pr = null;
    for (let i = 0; i < Math.min(3, toks.length); i++) { pr = readPart(toks[i]); if (pr) { at = i; break; } }
    if (!pr) continue;
    // Diagram label lines: several part numbers, no quantities.
    if (toks.filter((t) => readPart(t)).length >= 3) continue;
    const tail = toks.slice(at + 1);
    // Quantities: the last 3 (+ per-100) numeric-ish tokens.
    const nums = [];
    for (let j = tail.length - 1; j >= 0 && nums.length < 4; j--) {
      const t = tail[j];
      if (t === 'SEE_O') continue;
      if (/^[0-9OolI|A]{1,3}$/.test(t)) nums.unshift(t); else break;
    }
    const seeO = tail.includes('SEE_O');
    const q = seeO ? nums.slice(-3) : nums.length === 4 ? nums.slice(0, 3) : null;
    const name = tail.slice(0, tail.length - nums.length - (seeO ? 1 : 0)).join(' ').replace(/[.\s]+(HDMC|OAKES.*)?$/i, '').trim();
    const flags = pr.flag ? [pr.flag] : [];
    if (!q || q.length < 3) { rows.push({ page, part_raw: toks[at], part: pr.part, name, used_raw: nums.join(' '), fits: [], flags: [...flags, 'qty:unread'] }); continue; }
    const fits = [];
    q.forEach((t, k) => {
      const n = QTY(t);
      const col = book.columns[k];
      if (n == null) flags.push(`qty:unreadable_${col.year}`);
      else if (n > 0) fits.push({ code: col.code, years: [col.year], lowYears: [] });
    });
    rows.push({ page, part_raw: toks[at], part: pr.part, name, used_raw: q.join(' '), fits, flags });
  }
  return rows;
}

// WLA by word position: tesseract TSV (level 5 = word). Quantity columns are found per page
// (scans shift), by clustering the x of small numbers in the right part of the page into 4
// columns (40WLA, 41WLA, 42WLA, per-100). Words belong to a part's row by vertical position
// (tesseract's own line ids split printed rows). A printed zero often OCRs as "e)" / "fe)".
// A blank or unreadable cell is unknown, never 0.
const QTY_WORD = (t) => {
  if (/^\S{0,2}\)$|^\(\)$|^[oO0]$|^QO$|^0\)$/.test(t)) return 0;
  return QTY(t);
};

function parseWlaTsv(book, page, tsv) {
  const words = tsv.split('\n').slice(1).map((l) => l.split('\t')).filter((c) => c[0] === '5' && c[11]?.trim())
    .map((c) => ({ x: +c[6] + +c[8] / 2, left: +c[6], y: +c[7] + +c[9] / 2, h: +c[9], text: c[11].trim() }));
  if (!words.length) return [];
  const W = Math.max(...words.map((w) => w.left));
  const qtyish = (w) => w.x > W * 0.7 && QTY_WORD(w.text) != null;
  const xs = words.filter(qtyish).map((w) => w.x).sort((a, b) => a - b);
  if (xs.length < 8) return [];
  // 1-D k-means, k=4, seeded at quantiles.
  let c = [0.1, 0.35, 0.6, 0.9].map((q) => xs[Math.floor(q * (xs.length - 1))]);
  for (let it = 0; it < 20; it++) {
    const g = c.map(() => []);
    for (const x of xs) g[c.reduce((bi, cv, i) => (Math.abs(x - cv) < Math.abs(x - c[bi]) ? i : bi), 0)].push(x);
    c = g.map((gg, i) => (gg.length ? gg.reduce((a, b) => a + b) / gg.length : c[i]));
  }
  c.sort((a, b) => a - b);
  const gaps = c.slice(1).map((v, i) => v - c[i]);
  if (Math.min(...gaps) < 40) return []; // columns didn't separate: not a parts-list page
  const tol = Math.min(...gaps) * 0.45;
  const rows = [];
  for (const pw of words) {
    if (pw.left > W * 0.2) continue;
    const pr = readPart(pw.text);
    if (!pr) continue;
    const band = words.filter((w) => w !== pw && Math.abs(w.y - pw.y) < pw.h * 0.6);
    if (band.filter((w) => readPart(w.text)).length >= 2) continue; // diagram labels
    const cells = [null, null, null, null];
    let bad = false;
    for (const w of band) {
      const k = c.findIndex((cv) => Math.abs(w.x - cv) <= tol);
      if (k < 0) continue;
      if (cells[k] != null) bad = true;
      cells[k] = w.text;
    }
    const name = band.filter((w) => w.x > pw.x && w.x < W * 0.55).sort((a, b) => a.x - b.x).map((w) => w.text).join(' ').replace(/[.\s]+$/, '');
    const flags = pr.flag ? [pr.flag] : [];
    if (bad) flags.push('qty:two_words_one_column');
    if (cells.slice(0, 3).every((v) => v == null)) continue; // part number in a note or diagram, no quantities
    // Claim only the years we could read; an unreadable year is noted, not claimed either way.
    const fits = [];
    const notes = [];
    book.columns.forEach((col, k) => {
      const n = cells[k] == null ? null : QTY_WORD(cells[k]);
      if (n == null) notes.push(`qty:unreadable_${col.year}`);
      else if (n > 0) fits.push({ code: col.code, years: [col.year], lowYears: [] });
    });
    if (notes.length === book.columns.length) flags.push('qty:unread');
    rows.push({ page, part_raw: pw.text, part: pr.part, name, used_raw: cells.map((v) => v ?? '?').join(' '), fits, flags, notes });
  }
  return rows;
}

// ---------- appl layout (1966-84 Shovelhead engine parts: DESCRIPTION | APPLICATION | P/N) ----------
// Columns come from the header words on each page (tesseract TSV). Application text:
//   "41 to early 81 Big Twins", "Late '81 to 84 FLH-80, Class", "78 to 84 FX, FL,'80 to '83 FL",
//   "66 to '80 1200cc Shovelhead", "78 to 84 1340 models".
// "Big Twins" / "Shovelhead" / "models" -> '*SHOVEL*' (11 resolves it to that year's Shovelhead
// big twins). "1340"/"80" and "1200"/"74" become a condition on the fit, not a model.
// A year is a lone 2-digit number: not the "80" of "FLH-80", not part of "1340".
const APPL_SEG = /(?:(early|late)\s+)?(?<![\w-])'?(\d{2})(?![\w-])(?:\s*to\s*(?:(early|late)\s+)?(?:'?(\d{2})(?![\w-])|(\*)))?/gi;

function applFits(book, app) {
  const flags = [];
  const fits = [];
  const t = app.replace(/[‘’`]/g, "'").replace(/\bTO\b/g, 'to').replace(/\b(F[LX][A-Z]*)-\s+(\d)/g, '$1-$2');
  const heads = [...t.matchAll(APPL_SEG)].filter((m) => Number(m[2]) >= 30 && Number(m[2]) <= 84 && (!m[4] || Number(m[4]) <= 84));
  if (!heads.length) return { fits, flags: ['used_on:no_years'] };
  heads.forEach((m, i) => {
    const target = t.slice(m.index + m[0].length, i + 1 < heads.length ? heads[i + 1].index : undefined).replace(/^[\s,;-]+|[\s,;]+$/g, '');
    const from = 1900 + Number(m[2]);
    const to = m[5] ? book.to : m[4] ? 1900 + Number(m[4]) : from;
    if (to < from) { flags.push('used_on:bad_range'); return; }
    const years = [];
    for (let y = from; y <= to; y++) years.push(y);
    const lowYears = [m[1] ? from : null, m[3] ? to : null].filter(Boolean);
    let cond = null;
    if (/\b1340\b|\b80\s*c/i.test(target)) cond = '80ci';
    else if (/\b1200\b|\b74\b/i.test(target)) cond = '74ci';
    const words = target.toUpperCase().replace(/CC\b/g, '').split(/[\s,]+/).filter(Boolean);
    const codes = [];
    let family = false;
    for (const w of words) {
      if (/^(BIG|T|TW|TWINS?|SHOVELHEADS?|SHOVELS?|MODELS?|1340|1200|ALL|ENGINES?)$/.test(w)) { family = true; continue; }
      if (/^CLASS/.test(w)) { codes.push('CLASSIC'); continue; }
      if (/^F[LX][A-Z]*(-[0-9A-Z]{2,3})?$/.test(w)) { codes.push(book.code(w)); continue; }
      if (/^(&|AND|W\/.*|ONLY)$/.test(w)) continue;
      flags.push(`used_on:word:${w}`);
    }
    if (family || (!codes.length && cond)) fits.push({ code: '*SHOVEL*', years, lowYears, cond });
    for (const c0 of codes) {
      const byCode = new Map();
      for (const y of years) { const c = book.yearCode ? book.yearCode(c0, y) : c0; if (c != null) (byCode.get(c) ?? byCode.set(c, []).get(c)).push(y); }
      for (const [code, ys] of byCode) fits.push({ code, years: ys, lowYears: lowYears.filter((y) => ys.includes(y)), cond });
    }
    if (!family && !codes.length && !cond) flags.push('used_on:no_target');
  });
  return { fits, flags };
}

function parseAppl(book, page, tsv) {
  if (!tsv) return [];
  const words = tsv.split('\n').slice(1).map((l) => l.split('\t')).filter((c) => c[0] === '5' && c[11]?.trim())
    .map((c) => ({ x: +c[6], y: +c[7] + +c[9] / 2, h: +c[9], text: c[11].trim() }));
  const app = words.filter((w) => /^APPLICATION$/i.test(w.text));
  const pn = words.filter((w) => /^P\/?N$/i.test(w.text));
  if (!app.length || !pn.length) return [];
  const xApp = Math.min(...app.map((w) => w.x)) - 15;
  const xPn = Math.min(...pn.map((w) => w.x)) - 25;
  // rows by y
  words.sort((a, b) => a.y - b.y);
  const lines = [];
  for (const w of words) {
    const l = lines[lines.length - 1];
    if (l && Math.abs(w.y - l.y) < w.h * 0.6) l.ws.push(w); else lines.push({ y: w.y, ws: [w] });
  }
  const rows = [];
  for (const { ws } of lines) {
    ws.sort((a, b) => a.x - b.x);
    const partTok = ws.filter((w) => w.x >= xPn).map((w) => w.text).join('');
    const pr = readPart(partTok.replace(/[^0-9A-Za-z-]/g, ''));
    if (!pr) continue;
    const name = ws.filter((w) => w.x < xApp).map((w) => w.text).join(' ');
    const appl = ws.filter((w) => w.x >= xApp && w.x < xPn).map((w) => w.text).join(' ');
    if (/^(DESCRIPTION|NOTE)/i.test(name)) continue;
    const { fits, flags } = applFits(book, appl);
    rows.push({ page, part_raw: partTok, part: pr.part, name, used_raw: appl, fits, flags: [...(pr.flag ? [pr.flag] : []), ...flags], notes: [...new Set(fits.map((f) => f.cond).filter(Boolean))].map((c) => `cond:${c}`) });
  }
  return rows;
}

// ---------- vin layout (2021 portal reissues of pre-1991 catalogs: INDEX | PART | DESCRIPTION | MODEL(S)) ----------
// MODEL(S) holds H-D model-identification codes with the year ("DB84 DB85 (early) DD84"),
// decoded by the book's own legend (books.mjs `legend`: "DB84" -> 'FLTC', null = skip, e.g.
// sidecar rigs). "ALL" = every legend code the book maps to a bike. "(early)"/"(late)" mark
// that year as a boundary year (low confidence). The model cell can wrap onto the next line.
const VIN_ROW = /^\s*(\d{1,3}[A-Z]?)?\s+(\d{3,5}(?:-\d{2})?[A-Z]{0,3})\s{2,}(.+?)\s{2,}(\S.*)$/;
const VIN_CODE = /^([A-Z]{2})(\d{2})$/;

function vinFits(book, models) {
  const flags = [];
  const byCode = new Map(); // our code -> { years:Set, low:Set }
  const add = (key, low) => {
    if (!(key in book.legend)) { flags.push(`code:unknown:${key}`); return; }
    const code = book.legend[key];
    if (code == null) return; // e.g. sidecar rig
    const y = 1900 + Number(key.slice(2));
    const e = byCode.get(code) ?? byCode.set(code, { years: new Set(), low: new Set() }).get(code);
    e.years.add(y);
    if (low) e.low.add(y);
  };
  const toks = models.replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean);
  if (!toks.length) flags.push('used_on:missing');
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].toUpperCase();
    const low = /^\((EARLY|LATE)\)$/i.test(toks[i + 1] ?? '');
    if (t === 'ALL') { for (const k of Object.keys(book.legend)) add(k, false); continue; }
    if (/^\((EARLY|LATE)\)$/.test(t)) continue;
    if (VIN_CODE.test(t)) { add(t, low); continue; }
    flags.push(`used_on:word:${t}`);
  }
  const fits = [...byCode].map(([code, e]) => ({ code, years: [...e.years].sort(), lowYears: [...e.low] }));
  return { fits, flags };
}

function parseVin(book, page, lines) {
  const rows = [];
  const header = lines.findIndex((l) => /^\s*INDEX\s+PART/.test(l));
  // Section title: the line after the book number ("99438-86B_01"), before the column header.
  const section = (lines.slice(0, Math.max(header, 0)).map((l) => l.trim()).filter((l) => l && !/_\d{2}$/.test(l)).pop() ?? '').slice(0, 80);
  let last = null;
  for (const raw of lines) {
    if (/MODEL IDENTIFICATION CODES/.test(raw)) break; // legend at the page foot
    const m = VIN_ROW.exec(raw);
    if (m) {
      const pr = readPart(m[2]);
      if (!pr) { last = null; continue; }
      last = { page, section, index: m[1] ?? null, part_raw: m[2], part: pr.part, name: m[3].trim(), used_raw: m[4].trim(), flags: pr.flag ? [pr.flag] : [] };
      rows.push(last);
      continue;
    }
    // Wrapped model cell: a line that is only codes / (early) / (late), far right.
    const t = raw.trim();
    if (last && /^((?:[A-Z]{2}\d{2}|\((?:early|late)\)|ALL)\s*)+$/i.test(t) && raw.search(/\S/) > 60) last.used_raw += ' ' + t;
  }
  for (const r of rows) {
    const { fits, flags } = vinFits(book, r.used_raw);
    r.fits = fits;
    r.flags.push(...flags);
  }
  return rows;
}

export function parsePage(book, page, text, tsv) {
  const lines = text.split('\n');
  if (book.layout === 'hd') return parseHd(book, page, lines);
  if (book.layout === 'hd1950') return parse1950(book, page, lines);
  if (book.layout === 'wla') return tsv ? parseWlaTsv(book, page, tsv) : parseWla(book, page, lines);
  if (book.layout === 'appl') return parseAppl(book, page, tsv);
  if (book.layout === 'vin') return parseVin(book, page, lines);
  throw new Error(`unknown layout ${book.layout}`);
}
