import { breaksOf, captureRanges, chainMembers, ourBreaks, ourSide } from '@/lib/compare';

// Captures vs our fitment. No params: every part name with its families and counts.
// ?part=&family=[&match=]: the comparison for one part name on one family; match = the
// words used to find our parts (defaults to the part name).
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const byPart = await captureRanges();
  const part = u.get('part');

  if (!part) {
    const list = [...byPart].map(([name, rs]) => {
      const fams = new Map<string, { ranges: number; pages: Set<number> }>();
      for (const r of rs) {
        const f = fams.get(r.family) ?? fams.set(r.family, { ranges: 0, pages: new Set() }).get(r.family)!;
        f.ranges++; f.pages.add(r.page);
      }
      return {
        part: name,
        captures: new Set(rs.map((r) => r.capture_id)).size,
        families: [...fams].map(([family, f]) => ({ family, ranges: f.ranges, pages: [...f.pages].sort((a, z) => a - z) })).sort((a, z) => z.ranges - a.ranges),
      };
    });
    list.sort((a, z) => z.captures - a.captures || a.part.localeCompare(z.part));
    return Response.json({ parts: list });
  }

  const family = u.get('family') ?? '';
  const ranges = (byPart.get(part) ?? []).filter((r) => r.family === family);
  if (!ranges.length) return Response.json({ error: 'no captures for that part and family' }, { status: 404 });
  const from = Math.min(...ranges.map((r) => r.from)), to = Math.max(...ranges.map((r) => r.to));
  const match = (u.get('match') ?? part).slice(0, 80);
  const ours = await ourSide(match, family, from, to);

  const vt = breaksOf(ranges);
  const hd = ourBreaks(ours.years);
  const near = (y: number, list: number[]) => list.some((x) => Math.abs(x - y) <= 1);
  const covered = new Set(ours.years.map((y) => y.year));
  const chainYears = new Map<string, number[]>();
  for (const y of ours.years) for (const c of y.chains) (chainYears.get(c) ?? chainYears.set(c, []).get(c)!).push(y.year);
  // lineage: one entry per chain, oldest first: its numbers (supersession order), steps, and
  // the year runs it fits on this family ([1985-1988, 1990-1993] when there's a hole)
  const seenChain = new Set<string>();
  const first = ours.parts.filter((p) => !seenChain.has(p.chain_root) && seenChain.add(p.chain_root));
  const members = await chainMembers(first.map((p) => p.chain_root));
  const parts = first.map((p) => {
    const ys = (chainYears.get(p.chain_root) ?? []).sort((a, z) => a - z);
    const runs: [number, number][] = [];
    for (const y of ys) { const r = runs[runs.length - 1]; if (r && y === r[1] + 1) r[1] = y; else runs.push([y, y]); }
    const m = members.get(p.chain_root);
    return { oem: p.oem, root: m?.members[m.members.length - 1] ?? p.oem, name: p.name, from: ys[0], to: ys[ys.length - 1], runs,
      members: m?.members ?? [p.oem], steps: m?.steps ?? [] };
  }).sort((a, z) => a.from - z.from || a.to - z.to);

  return Response.json({
    part, family, match, from, to,
    ranges: ranges.map(({ from, to, up, models, line, capture_id, page, via }) => ({ from, to, up, models, line, capture_id, page, via })),
    vtBreaks: vt,
    ourBreaks: hd,
    ourYears: [...covered].sort((a, z) => a - z),
    agree: vt.filter((y) => hd.includes(y)),
    close: vt.filter((y) => !hd.includes(y) && near(y, hd)),
    vtOnly: vt.filter((y) => !near(y, hd)),
    ourOnly: hd.filter((y) => !near(y, vt)),
    parts,
  });
}
