// Catalog captures (catalog_captures.text) -> year-range facts, one per year range on a
// line: "FLT 1999-06 | Smooth" -> { from 1999, to 2006, models ['FLT'] }. Pure; the
// compare page (/catalog/compare) resolves models to families with the vehicles table.
export type Fact = { from: number; to: number; up: boolean; models: string[]; line: string };

// "1999-06", "1999-2006", "99-06", "2014-up"; a lone 4-digit year. Not the tail of a V-Twin
// number (21-2036) and not a V-Twin number itself (50-2007 = 2-digit base + 4-digit year).
const RANGE = /(?<!\d-)\b((?:19|20)?\d\d)\s*[-–]\s*((?:19|20)?\d\d|up)\b(?!-\d)/gi;
const YEAR = /(?<!\d-)\b((?:19|20)\d\d)\b(?![-–]\d)/g;
export const MODEL = /\b(FL[A-Z0-9]*|FX[A-Z0-9]*|XL[A-Z0-9]*|XG[A-Z0-9]*|M-?8|Touring|Softails?|Dynas?|Sportsters?|Big Twins?|Twin Cam|Evo)\b/g;
export const UP_YEAR = 2025;

const year = (s: string) => {
  const n = Number(s);
  return n > 100 ? n : n >= 30 ? 1900 + n : 2000 + n;
};

export function factsOf(text: string): Fact[] {
  const out: Fact[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const models = [...new Set([...line.matchAll(MODEL)].map((m) => m[1].toUpperCase()))];
    let found = false;
    for (const m of line.matchAll(RANGE)) {
      if (m[1].length === 2 && m[2].length === 4) continue;
      const from = year(m[1]);
      const up = m[2].toLowerCase() === 'up';
      let to = up ? UP_YEAR : year(m[2]);
      if (to < from && to + 100 <= 2030) to += 100;
      if (from < 1903 || to > 2030 || to < from) continue;
      out.push({ from, to, up, models, line });
      found = true;
    }
    if (!found) for (const m of line.matchAll(YEAR)) out.push({ from: Number(m[1]), to: Number(m[1]), up: false, models, line });
  }
  return out;
}

// Years where something starts or ends inside the covered span: [2000-2007, 2008-up] -> 2008.
export function breaksOf(ranges: { from: number; to: number }[]): number[] {
  if (!ranges.length) return [];
  const lo = Math.min(...ranges.map((r) => r.from)), hi = Math.max(...ranges.map((r) => r.to));
  const b = new Set<number>();
  for (const r of ranges) {
    if (r.from > lo) b.add(r.from);
    if (r.to < hi) b.add(r.to + 1);
  }
  return [...b].sort((a, z) => a - z);
}
