import { overlap, textIn, type Box, type Word } from './catalogText';

// Suggested capture boxes for one catalog page, shaped like Laken's hand-drawn ones:
// a run of lines that carry a year range ("FLT 1999-2016", "1993-08 | Smooth",
// "90200873 | 2014-up"), widened to the table row they sit in, with the heading above
// as the part name. Boxes that overlap a saved (or skipped) capture are left out.
export type Suggestion = Box & { text: string; part: string };

// (?<!\d-): not the tail of a V-Twin number like 21-2036
const YEARS = /(?<!\d-)\b(?:19|20)\d\d\s*[-–]\s*(?:\d{2,4}|up)\b|(?<!\d-)\b\d\d\s*[-–]\s*(?:\d\d|up)\b(?!-)|(?<!\d-)\b(?:19|20)\d\d\b(?!-\d[A-Z]?\b)|(?<!\d-)\b(?:19|20)\d\d-(?:E|L|Early|Late)/i;
// column-header words: a line made only of these is a table header, not the part's heading
const HEADER = /^(?:VT|No\.?|OEM#?|Fits?|Year|Years|Model|Models|Item|Description|Type|Finish|Style|Chrome|Black|Polished|Standard|Stainless|Length|Size|Qty\.?|Piece|Head|Side|Application|Kit|Each|Pair|Set|Gloss|Raw|Zinc|\||&|\/)$/i;
const VTNO = /\b\d{2}-\d{4}[A-Z]?\*?|\b\d{4}-\d{1,2}[A-Z]?\b/g;
const COL_GAP = 14;   // words further apart than this on one line are separate columns
const ROW_GAP = 16;   // a line this close under a run (and overlapping it) continues the run
const ROW_JOIN = 30;  // same-line columns this close to a run belong to its table row
const TITLE_UP = 90;  // how far above a run its heading may sit

type Seg = Box & { words: Word[]; text: string; size: number; bold: boolean; fit: boolean };

function segments(words: Word[]): Seg[] {
  const ws = [...words].sort((a, z) => a[3] - z[3] || a[1] - z[1]);
  const lines: Word[][] = [];
  for (const w of ws) {
    const L = lines[lines.length - 1];
    if (L && Math.abs(L[0][3] - w[3]) < 2.5) L.push(w);
    else lines.push([w]);
  }
  const out: Seg[] = [];
  for (const L of lines) {
    L.sort((a, z) => a[1] - z[1]);
    let cur: Word[] = [L[0]];
    const flush = () => {
      const text = cur.map((w) => w[0]).join(' ');
      out.push({
        x0: cur[0][1], x1: cur[cur.length - 1][2], y0: Math.min(...cur.map((w) => w[3])), y1: Math.max(...cur.map((w) => w[4])),
        words: cur, text, size: Math.max(...cur.map((w) => w[5] ?? 0)), bold: cur.some((w) => w[6] === 1), fit: YEARS.test(text),
      });
    };
    for (const w of L.slice(1)) {
      if (w[1] - cur[cur.length - 1][2] > COL_GAP) { flush(); cur = [w]; } else cur.push(w);
    }
    flush();
  }
  return out;
}

const xOverlap = (a: Box, b: Box, slack = 0) => a.x0 < b.x1 + slack && a.x1 > b.x0 - slack;

export function suggest(words: Word[], taken: Box[]): Suggestion[] {
  if (!words.length) return [];
  const segs = segments(words);
  const body = [...segs].map((s) => s.size).sort((a, z) => a - z)[Math.floor(segs.length / 2)] ?? 9;

  // runs of year-bearing segments, top to bottom
  const runs: (Box & { segs: Seg[] })[] = [];
  for (const s of segs.filter((s) => s.fit).sort((a, z) => a.y0 - z.y0 || a.x0 - z.x0)) {
    const r = runs.find((r) => s.y0 - r.y1 <= ROW_GAP && s.y0 >= r.y0 - 2 && xOverlap(s, r));
    if (r) { r.segs.push(s); r.x0 = Math.min(r.x0, s.x0); r.x1 = Math.max(r.x1, s.x1); r.y1 = Math.max(r.y1, s.y1); }
    else runs.push({ x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1, segs: [s] });
  }

  const out: Suggestion[] = [];
  for (const r of runs) {
    // widen to the table row: same-line columns chained within ROW_JOIN of the run; a column
    // with years of its own is a neighbouring table (its own run), not part of this row
    let grew = true;
    while (grew) {
      grew = false;
      for (const s of segs) {
        if (s.fit || s.y0 < r.y0 - 1 || s.y1 > r.y1 + 1 || (s.x0 >= r.x0 && s.x1 <= r.x1)) continue;
        if (s.x0 - r.x1 <= ROW_JOIN && s.x1 > r.x1) { r.x1 = s.x1; grew = true; }
        if (r.x0 - s.x1 <= ROW_JOIN && s.x0 < r.x0) { r.x0 = s.x0; grew = true; }
      }
    }
    // heading: a line above the run, over it, without years, not a column header and not a
    // sentence; bold or bigger type wins, then the nearest. V-Twin numbers are dropped.
    const nameOf = (s: Seg) => s.text.replace(VTNO, ' ').replace(/^[•·\-\s]+/, '').replace(/\s+/g, ' ').trim();
    const above = segs
      .filter((s) => !s.fit && s.y1 <= r.y0 + 1 && r.y0 - s.y1 <= TITLE_UP && xOverlap(s, r))
      .filter((s) => { const n = nameOf(s); return /[A-Za-z]{3}/.test(n) && !n.split(' ').every((w) => HEADER.test(w)) && n.split(' ').length <= 8 && !/[.,;]$/.test(n)
        && !/^[a-z*]/.test(n) && !/\bnote\b/i.test(n); })
      .sort((a, z) => Number(z.bold || z.size > body + 0.5) - Number(a.bold || a.size > body + 0.5) || z.y1 - a.y1);
    const part = above[0] ? nameOf(above[0]).slice(0, 80) : '';
    const box = { x0: r.x0 - 2, y0: r.y0 - 2, x1: r.x1 + 2, y1: r.y1 + 2 };
    if (taken.some((t) => overlap(t, box) > 0.3)) continue;
    if (out.some((o) => overlap(o, box) > 0.6)) continue;
    const text = textIn(words, box);
    if (text.trim()) out.push({ ...box, text, part });
  }
  return out.sort((a, z) => a.y0 - z.y0 || a.x0 - z.x0);
}
