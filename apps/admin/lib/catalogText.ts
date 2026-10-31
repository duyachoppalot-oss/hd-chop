// Pure helpers shared by the catalog viewer (client) and its API (server).
// Word = [text, x0, x1, top, bottom, font size, bold 0/1], PDF points, origin top-left.
export type Word = [text: string, x0: number, x1: number, top: number, bottom: number, size: number, bold: number];
export type Box = { x0: number; y0: number; x1: number; y1: number };

// Words whose centre is in the box -> lines (same top within 2.5pt), columns split by " | ".
export function textIn(words: Word[], b: Box): string {
  const inBox = words.filter((w) => {
    const cx = (w[1] + w[2]) / 2, cy = (w[3] + w[4]) / 2;
    return cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1;
  }).sort((a, z) => a[3] - z[3] || a[1] - z[1]);
  const lines: Word[][] = [];
  for (const w of inBox) {
    const L = lines[lines.length - 1];
    if (L && Math.abs(L[0][3] - w[3]) < 2.5) L.push(w);
    else lines.push([w]);
  }
  return lines
    .map((L) => L.sort((a, z) => a[1] - z[1]).reduce((s, w, i) => (i === 0 ? w[0] : s + (w[1] - L[i - 1][2] > 9 ? ' | ' : ' ') + w[0]), ''))
    .join('\n');
}

// Share of the smaller box covered by the other.
export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;
  const area = (x: Box) => Math.max(1, (x.x1 - x.x0) * (x.y1 - x.y0));
  return (w * h) / Math.min(area(a), area(b));
}
