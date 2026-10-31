import { query } from './db';
import { breaksOf } from './captureFacts';
import { captureRanges, cleanName } from './compare';

// Catalog captures that speak about one part (admin /part/[oem] "Catalog ranges"):
//   number = the capture's text prints a number of the part's chain;
//   kind   = the capture's part name names the same kind of part (its words all in our name,
//            noun agreeing) or the capture is linked to the part's part type.
// Ranges are kept on the families the part fits (all of them when it has no fitment), next
// to the years our H-D fitment lists the part there.

const POSITION = /^(outer|inner|left|right|front|rear|upper|lower|top|bottom|side)$/;
const nounOf = (w: string[]) => (w[w.length - 1] ?? '').replace(/s$/, '');
const joinedName = (d: string) => { const [h, ...r] = d.split(','); return `${r.join(' ')} ${h}`.trim(); };

export async function partCaptures(key: string) {
  const members = await query<{ oem_number: string; oem_display: string; description_clean: string | null; slug: string | null }>(
    `SELECT p.oem_number, p.oem_display, r.description_clean, c.slug
     FROM oem_parts p JOIN oem_parts r ON r.oem_number = p.chain_root LEFT JOIN part_concepts c ON c.concept_id = coalesce(r.concept_id, p.concept_id)
     WHERE p.chain_root = (SELECT chain_root FROM oem_parts WHERE oem_number = $1)`, [key]);
  if (!members.length) return null;
  const ours = cleanName(joinedName(members[0].description_clean ?? '')).split(' ').filter(Boolean);
  const ourSet = new Set(ours.map((w) => w.replace(/s$/, '')));
  const slug = members[0].slug;
  const numbers = members.flatMap((m) => [m.oem_display, m.oem_number]);

  const caps = await query<{ capture_id: number; page: number; part: string; note: string; text: string; concept_slug: string | null; kind: string }>(
    `SELECT capture_id, page, part, note, text, concept_slug, kind FROM catalog_captures
     WHERE catalog = 'vtwin' AND status NOT IN ('skipped', 'rejected') ORDER BY page, y0`);
  const reason = new Map<number, 'number' | 'kind'>();
  for (const c of caps) {
    const flat = c.text.replace(/\s+/g, ' ');
    if (numbers.some((n) => new RegExp(`(^|[^0-9A-Z-])${n.replace(/[-]/g, '-?')}([^0-9A-Z]|$)`, 'i').test(flat))) { reason.set(c.capture_id, 'number'); continue; }
    const w = cleanName(c.part).split(' ').filter(Boolean);
    const req = w.filter((x) => !POSITION.test(x)).map((x) => x.replace(/s$/, ''));
    const nameMatch = req.length > 0 && nounOf(w) === nounOf(ours) && req.every((x) => ourSet.has(x));
    if (nameMatch || (slug && c.concept_slug === slug)) reason.set(c.capture_id, 'kind');
  }

  const fit = await query<{ platform: string; year: number }>(
    `SELECT DISTINCT v.platform, v.year FROM fitment f JOIN vehicles v USING (vehicle_id)
     WHERE f.oem_number = ANY($1) AND f.confidence IN ('high', 'medium') ORDER BY 1, 2`, [members.map((m) => m.oem_number)]);
  const ourYears = new Map<string, number[]>();
  for (const r of fit) (ourYears.get(r.platform) ?? ourYears.set(r.platform, []).get(r.platform)!).push(r.year);

  // per line: 'number' only where the line itself prints a chain number; the box's other
  // lines (other numbers, other years) count as the same kind of part
  const numRe = new RegExp(`(^|[^0-9A-Z-])(${numbers.map((n) => n.replace(/[-]/g, '-?')).join('|')})([^0-9A-Z]|$)`, 'i');
  // (a box whose number and years sit on different lines counts whole)
  const all = [...(await captureRanges()).values()].flat().filter((r) => reason.has(r.capture_id));
  const lineHit = new Set(all.filter((r) => numRe.test(r.line)).map((r) => r.capture_id));
  const lineReason = (r: { capture_id: number; line: string }) =>
    reason.get(r.capture_id) === 'number' && (numRe.test(r.line) || !lineHit.has(r.capture_id)) ? 'number' : 'kind';
  // a capture that prints the part's own number always shows, even on a family we don't list it for
  const fams = [...new Set(all.map((r) => r.family))]
    .filter((f) => !ourYears.size || ourYears.has(f) || all.some((r) => r.family === f && lineReason(r) === 'number'));
  const families = fams.map((family) => {
    // on a family we don't list the part for, only the boxes that print its number
    const ranges = all.filter((r) => r.family === family && (ourYears.has(family) || !ourYears.size || lineReason(r) === 'number'));
    const years = ourYears.get(family) ?? [];
    const runs: [number, number][] = [];
    for (const y of years) { const r = runs[runs.length - 1]; if (r && y === r[1] + 1) r[1] = y; else runs.push([y, y]); }
    return {
      family, ourRuns: runs,
      ranges: ranges.map((r) => ({ from: r.from, to: r.to, up: r.up, line: r.line, page: r.page, capture_id: r.capture_id, reason: lineReason(r) })),
      capBreaks: breaksOf(ranges),
    };
  }).sort((a, z) => z.ourRuns.length - a.ourRuns.length || z.ranges.length - a.ranges.length);

  const used = new Set(families.flatMap((f) => f.ranges.map((r) => r.capture_id)));
  const captures = caps.filter((c) => used.has(c.capture_id) || reason.get(c.capture_id) === 'number')
    .map((c) => ({ capture_id: c.capture_id, page: c.page, part: c.part, note: c.note, kind: c.kind, reason: reason.get(c.capture_id)! }))
    .sort((a, z) => Number(z.reason === 'number') - Number(a.reason === 'number') || a.page - z.page);
  return { families, captures };
}
