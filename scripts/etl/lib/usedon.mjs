// scripts/etl/lib/usedon.mjs
//
// Parses hd_oem_catalog_reference.used_on_raw (shapes from discovery, 2026-10-23):
//   ALL                                   -> { kind: 'all' }   (scope = the document's models)
//   FXD, FXDL,, FXDWG / FXDF 103 / FLTCU 1993
//                                         -> { kind: 'codes', items, bad }
//   DYNA: 93*-ALL / FLT: 95-ALL           -> { kind: 'family', platform, from, open }
//   86 TO * - ALL MODELS / 86 TO EARLY 88 - XLH, XLCH / 86 & 87 - ALL MODELS
//                                         -> { kind: 'range', from, to, lowYears, all | items }
//   anything else                         -> { kind: 'unparsed', reason }
// The catalog's "*" ("and later") is also extracted as ' or •.

const FAMILY_PLATFORM = { DYNA: 'dyna', SOFTAIL: 'softail', FLT: 'touring', FXR: 'fxr', XL: 'sportster', SPORTSTER: 'sportster' };

// Words after a model code that don't change which model it is.
const QUALIFIERS = new Set(['103', '107', '110', '114', '117', 'ANV', 'ANX', 'TC', 'SHRINE', 'CVO', 'SE']);
// "FXRS CONV" is the FXRS Convertible, not the FXRS. Only FXDS (itself the Dyna
// Convertible) can drop the word.
const CONV_OK = new Set(['FXDS']);

export const twoDigitYear = (yy) => (Number(yy) >= 27 ? 1900 : 2000) + Number(yy);

function parseCodeToken(t) {
  const words = t.split(/\s+/).filter(Boolean);
  const code = words[0];
  if (!/^[A-Z][A-Z0-9-]*$/.test(code) || !/[A-Z]{2}/.test(code)) return null;
  let year = null;
  for (const w of words.slice(1)) {
    if (/^\d{4}$/.test(w)) year = Number(w);
    else if (!QUALIFIERS.has(w) && !(w === 'CONV' && CONV_OK.has(code))) return null;
  }
  // Glued edition suffix: FLHTKANV, FLTRXSANV.
  const alts = [code];
  const glued = /^(.+?)(ANV|ANX)$/.exec(code);
  if (glued) alts.push(glued[1]);
  return { code, alts, year };
}

function parseCodeList(s) {
  const items = [];
  const bad = [];
  let all = false;
  for (const t of s.split(/,+/).map((x) => x.trim()).filter(Boolean)) {
    if (t === 'ALL' || t === 'ALL MODELS') { all = true; continue; }
    if (/^\d{4}$/.test(t) || QUALIFIERS.has(t) || t === 'CONV') continue; // stray year / tag split off by a double comma
    const item = parseCodeToken(t);
    if (item) items.push(item);
    else bad.push(t);
  }
  return { items, bad, all };
}

// One cell can hold several ranges ("84 to * - FXST; 85 to * - FXWG") and
// single years ("85 - FXSB, FXEF", "85 & Early 86 - FXWG"): split on ";" and
// write a single year as "85 to 85" so parseUsedOn reads each part.
export const splitUsedOn = (raw) =>
  raw.split(';').map((p) => p.trim()).filter(Boolean)
    .map((p) => p.replace(/^((?:EARLY |LATE )?\d{2}) ?- ?/i, (m, y) => `${y} to ${y.replace(/\D/g, '')} - `));

export function parseUsedOn(raw) {
  if (raw == null || !raw.trim()) return { kind: 'unparsed', reason: 'empty' };
  const s = raw.toUpperCase().replace(/[•'’]/g, '*').replace(/\s+/g, ' ').trim();
  if (s === 'ALL' || s === 'ALL MODELS') return { kind: 'all' };

  const fam = /^([A-Z]+)\s*:\s*(\d{2})\s*(\*)?\s*-\s*(.+)$/.exec(s);
  if (fam) {
    const platform = FAMILY_PLATFORM[fam[1]];
    if (!platform) return { kind: 'unparsed', reason: 'unknown_family' };
    if (fam[4].trim() !== 'ALL') return { kind: 'unparsed', reason: 'option_code_scope' }; // DYNA: 95*-GE
    return { kind: 'family', platform, from: twoDigitYear(fam[2]), open: !!fam[3] };
  }

  const range = /^(EARLY |LATE )?(\d{2}) ?(TO|&) ?(EARLY |LATE )?(\d{2}|\*) ?- ?(.+)$/.exec(s);
  if (range) {
    const from = twoDigitYear(range[2]);
    const to = range[5] === '*' ? null : twoDigitYear(range[5]);
    // A mid-year boundary ("early 88") means only some of that year's bikes.
    const lowYears = [];
    if (range[1]) lowYears.push(from);
    if (range[4] && to != null) lowYears.push(to);
    const target = parseCodeList(range[6]);
    if (target.all) return { kind: 'range', from, to, lowYears, all: true };
    if (!target.items.length) return { kind: 'unparsed', reason: 'range_without_models' };
    return { kind: 'range', from, to, lowYears, items: target.items, bad: target.bad };
  }

  if (/[:*]|\bTO\b/.test(s)) return { kind: 'unparsed', reason: 'unknown_scope_form' };

  const list = parseCodeList(s);
  if (list.all && !list.items.length) return { kind: 'all' };
  if (!list.items.length) return { kind: 'unparsed', reason: 'no_model_codes' };
  return { kind: 'codes', items: list.items, bad: list.bad, alsoAll: list.all };
}
