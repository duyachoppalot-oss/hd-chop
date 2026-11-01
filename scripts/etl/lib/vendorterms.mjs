// Vendor model-token resolver. Rules and reasons: docs/HD_TERMINOLOGY.md.
// resolveSegment('FL', 1941, 1984, vehicles) -> { kind, matches: [vehicle], reason }
//   kind: 'model' (exact code), 'family' (shorthand expanded), 'review', 'skip', 'reject'
// Never creates vehicles: matches are drawn only from the vehicles passed in.

// FL (≤1984) and FX (≤1986) chassis families are their own platforms ('fl', 'fx'; 01_vehicles chassisPlatform).
const FL_PRE85 = (v) => v.platform === 'fl';
const FLT_CHASSIS_PRE85 = /^(FLT|FLTC|FLHT|FLHTC)$/;
const FX_SWINGARM = (v) => v.platform === 'fx';

const SKIP = /^(BIG ?TWIN|ALL( MODELS)?|CUSTOM APPLICATION|FRONT OR REAR)\b/i;
const REJECT = /^(CHIEF|SCOUT|INDIAN)\b/i;
const PRE_1930 = /^(J|JD|JE|JH|JDH|F|FD|FE)$/;

const years = (y0, y1) => (v) => v.year >= y0 && v.year <= y1;

function family(tok, y0, y1, vs) {
  const inYears = vs.filter(years(y0, y1));
  const pick = (f, reason) => ({ kind: 'family', matches: inYears.filter(f), reason });
  switch (tok) {
    case 'FL':
    case 'FL FX':
    case 'FL/FX':
      if (y0 <= 1984) {
        const fl = (v) => v.year <= 1984 && FL_PRE85(v);
        if (tok === 'FL') return pick(fl, 'FL big twin family ≤1984');
        return pick((v) => fl(v) || (v.year <= 1986 && FX_SWINGARM(v)), 'all pre-Evo big twins');
      }
      if (tok === 'FL') return { kind: 'review', matches: [], reason: 'bare FL after 1984' };
      return pick((v) => v.platform === 'softail', 'FL/FX ≥1984 = Softail');
    case 'FLH':
      if (y0 <= 1984) return pick((v) => v.year <= 1984 && /^FLH/.test(v.model_code) && !FLT_CHASSIS_PRE85.test(v.model_code), 'FLH ≤1984');
      return pick((v) => v.platform === 'touring' && /^FLH/.test(v.model_code), 'FLH* touring');
    case 'FLT':
    case 'FLH/FLT':
    case 'FLT/FLH':
      return pick((v) => (v.year <= 1984 ? FLT_CHASSIS_PRE85.test(v.model_code) : v.platform === 'touring'), 'FLT chassis / Touring');
    case 'FX':
      return pick((v) => v.year <= 1986 && FX_SWINGARM(v), 'FX swingarm family');
    case 'FXR':
      return pick((v) => v.platform === 'fxr' && /^FX(R|LR)/.test(v.model_code), 'FXR family');
    case 'FXST':
      if (y1 >= 2018) return { kind: 'review', matches: [], reason: 'FXST range reaches 2018+ (renamed Softails)' };
      return pick((v) => v.platform === 'softail' && /^FX/.test(v.model_code), 'FX Softails');
    case 'FLST':
      if (y1 >= 2018) return { kind: 'review', matches: [], reason: 'FLST range reaches 2018+ (renamed Softails)' };
      return pick((v) => v.platform === 'softail' && /^FL/.test(v.model_code), 'FL Softails');
    case 'FXD':
      return pick((v) => v.platform === 'dyna', 'Dyna');
    case '1200':
    case '883':
    case '1000':
      // displacement alone = that Sportster (Laken 2026-11-01): XL1200*, XLH1200, XR1000 not included
      if (y0 < 1957) return { kind: 'review', matches: [], reason: `${tok} before 1957` };
      return pick((v) => v.platform === 'sportster' && new RegExp(`^XL[A-Z]*${tok}`).test(v.model_code), `Sportster ${tok}`);
    case 'XL':
      if (y0 < 1957) return { kind: 'review', matches: [], reason: 'XL before 1957 (K model era)' };
      // XR750 is a factory race bike; vendors' "XL" means street Sportsters.
      return pick((v) => v.platform === 'sportster' && v.model_code !== 'XR750', 'Sportster');
    default:
      return null;
  }
}

export function resolveSegment(rawTok, y0, y1, vehicles) {
  const tok = rawTok.trim().toUpperCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');
  // "FXFB,FXFBS 2018-2020": resolve each code, merge.
  if (tok.includes(',')) {
    const parts = tok.split(',').filter(Boolean).map((t) => resolveSegment(t, y0, y1, vehicles));
    const matches = [...new Set(parts.flatMap((p) => p.matches))];
    if (parts.every((p) => p.kind === 'model')) return { kind: 'model', matches, reason: 'exact codes' };
    return { kind: 'review', matches: [], reason: 'code list with unresolved part' };
  }
  if (REJECT.test(tok)) return { kind: 'reject', matches: [], reason: 'not Harley-Davidson' };
  if (SKIP.test(tok)) return { kind: 'skip', matches: [], reason: 'too broad' };
  if (PRE_1930.test(tok)) return { kind: 'skip', matches: [], reason: 'pre-1930, no vehicles' };
  const fam = family(tok, y0, y1, vehicles);
  if (fam) return fam;
  const exact = vehicles.filter((v) => v.model_code === tok && v.year >= y0 && v.year <= y1);
  if (exact.length) return { kind: 'model', matches: exact, reason: 'exact code' };
  if (vehicles.some((v) => v.model_code === tok)) return { kind: 'review', matches: [], reason: 'code exists, not in these years' };
  return { kind: 'review', matches: [], reason: 'unknown code' };
}

// "FL 1948-1964 | EL 1936-1940 | FLT 2017-UP" -> [{ tok, y0, y1 }] (UP -> 2026); unparsed parts -> { tok, raw }
export function splitFitmentRaw(text, upTo = 2026) {
  return text.split('|').map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^(.+?)\s+(\d{4})\s*-\s*(\d{4}|UP)$/i);
    if (!m) return { tok: p, raw: true };
    return { tok: m[1], y0: +m[2], y1: /UP/i.test(m[3]) ? upTo : +m[3] };
  });
}

// Free model text from a source that mixes codes, families and names ("FLH SERIES",
// "SPORTSTER XLCH", "ELECTRA GLIDE", "1200 CUSTOM SPORTSTER") for one model year.
// Order: the whole text as a code/family (resolveSegment), each word as a code/family, then
// the model names of that year's vehicles (vehicles.model_name, so names stay year-bounded:
// "FAT BOB" is FXDF in 2008 and FXFB in 2018). Same result shape as resolveSegment.
const FILLER = /\b(SERIES|MODELS?|FAMILY|MOTORCYCLES?|HARLEY[- ]DAVIDSON|H-D)\b/g;
export function resolveModelText(text, year, vehicles) {
  const t = text.toUpperCase().replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return { kind: 'skip', matches: [], reason: 'make only' };
  const whole = resolveSegment(t, year, year, vehicles);
  if (whole.matches.length || ['skip', 'reject'].includes(whole.kind)) return whole;
  const words = t.split(/[\s/,]+/).filter(Boolean);
  const byWord = words.map((w) => resolveSegment(w, year, year, vehicles)).filter((r) => r.matches.length);
  // a code word beats a family word (SPORTSTER XLCH -> XLCH, not every Sportster)
  const codes = byWord.filter((r) => r.kind === 'model');
  if (codes.length) return { kind: 'model', matches: [...new Set(codes.flatMap((r) => r.matches))], reason: 'code in text' };
  const inYear = vehicles.filter((v) => v.year === year && v.model_name);
  const named = inYear.filter((v) => ` ${v.model_name.toUpperCase()} `.includes(` ${t} `));
  if (named.length) return { kind: 'family', matches: named, reason: 'model name' };
  if (byWord.length === 1) return byWord[0];
  return { kind: 'review', matches: [], reason: whole.reason };
}
