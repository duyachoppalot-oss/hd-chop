import { query } from './db';
import { breaksOf, factsOf, type Fact } from './captureFacts';
import { sectionOf } from './catalog';

// Catalog captures vs our H-D fitment, per part name and family (/catalog/compare).
// Captures: the year ranges Laken boxed, family from the models on the line (else the
// box's other lines, else the catalog section). Ours: parts whose name matches the part
// name with the noun agreeing ("outer primary cover" ~ "Cover, primary", not "Gasket,
// primary cover"); per model year the set of part chains fitting that family; a change
// year is where that set changes.

type Veh = { year: number; model_code: string; platform: string };
let vehCache: Veh[] | null = null;
async function vehicles() {
  vehCache ??= await query<Veh>(`SELECT year, model_code, platform FROM vehicles`);
  return vehCache;
}

const WORD_FAMILY: Record<string, string[]> = {
  TOURING: ['touring'], SOFTAIL: ['softail'], SOFTAILS: ['softail'], DYNA: ['dyna'], DYNAS: ['dyna'],
  SPORTSTER: ['sportster'], SPORTSTERS: ['sportster'], 'BIG TWIN': ['fl', 'fx', 'fxr', 'touring', 'softail', 'dyna'],
  'BIG TWINS': ['fl', 'fx', 'fxr', 'touring', 'softail', 'dyna'], M8: ['touring', 'softail'], 'M-8': ['touring', 'softail'],
};
// Model token + years -> families (HD_TERMINOLOGY: bare FL <=1984 = fl, later Touring;
// bare FX 1971-86 = fx, later Dyna; other codes = every vehicle code starting with it).
function familiesOf(token: string, from: number, to: number, vs: Veh[]): string[] {
  if (WORD_FAMILY[token]) return WORD_FAMILY[token];
  if (token === 'TWIN CAM' || token === 'EVO') return [];
  if (token === 'FL') return [...(from <= 1984 ? ['fl'] : []), ...(to > 1984 ? ['touring'] : [])];
  if (token === 'FX') return [...(from <= 1986 ? ['fx'] : []), ...(to > 1986 ? ['dyna'] : [])];
  // prefix match; trikes only when the token names a trike code itself (FLHTCUTG, FLRT)
  const t = token.replace(/-/g, '');
  return [...new Set(vs.filter((v) => v.year >= from && v.year <= to && v.model_code.replace(/-/g, '').startsWith(t)
    && (v.platform !== 'trike' || v.model_code.replace(/-/g, '') === t)).map((v) => v.platform))];
}
const SECTION_FAMILY: Record<string, string[]> = { Touring: ['touring'], Sportster: ['sportster'] };

export type CapRange = Fact & { capture_id: number; page: number; family: string; via: 'line' | 'box' | 'section' };
type CapRow = { capture_id: number; page: number; part: string; text: string };

export async function captureRanges(): Promise<Map<string, CapRange[]>> {
  const vs = await vehicles();
  const caps = await query<CapRow>(
    `SELECT capture_id, page, lower(trim(part)) AS part, text FROM catalog_captures WHERE catalog = 'vtwin' AND status <> 'skipped' ORDER BY page, y0`
  );
  const byPart = new Map<string, CapRange[]>();
  for (const c of caps) {
    const facts = factsOf(c.text);
    const boxModels = [...new Set(facts.flatMap((f) => f.models))];
    for (const f of facts) {
      let via: CapRange['via'] = 'line';
      let fams = [...new Set(f.models.flatMap((m) => familiesOf(m, f.from, f.to, vs)))];
      if (!fams.length) { via = 'box'; fams = [...new Set(boxModels.flatMap((m) => familiesOf(m, f.from, f.to, vs)))]; }
      if (!fams.length) { via = 'section'; fams = SECTION_FAMILY[sectionOf('vtwin', c.page)] ?? []; }
      const key = c.part || '(no part name)';
      for (const family of fams) {
        const list = byPart.get(key) ?? byPart.set(key, []).get(key)!;
        list.push({ ...f, capture_id: c.capture_id, page: c.page, family, via });
      }
    }
  }
  return byPart;
}

// Words that don't name the part: catalog filler and vendor wording ("caliper for flt",
// "clutch pack kit", "chrome rocker box cover set"); the last remaining word is the noun.
const FILLER = /\b(assembly|assy|asy|kit|kits|complete|set|sets|of|only|pair|each|chrome|black|polished|billet|stock|oe|oem|replacement|replica|type|style|models?|touring|flt)\b/g;
export const cleanName = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\s+for\s+.*$/, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();

// Our parts named like the match words: noun agrees, every non-position word present.
export async function partsNamedLike(match: string) {
  const words = cleanName(match).split(' ').filter(Boolean);
  if (!words.length) return [];
  const noun = words[words.length - 1].replace(/s$/, '');
  // every word must be in our name (word start, so "cover" matches "covers"), except
  // position words: "outer primary cover" ~ "Cover, primary"; "clutch plate" !~ "Plate, switch"
  const required = words.filter((w) => !/^(outer|inner|left|right|front|rear|upper|lower|top|bottom|side)$/.test(w)).map((w) => w.replace(/s$/, ''));
  const parts = await query<{ oem: string; chain_root: string; name: string; ws: number }>(
    `WITH named AS (
       SELECT oem_number, oem_display, chain_root, description_clean,
              trim(regexp_replace(regexp_replace(lower(coalesce(nullif(trim(split_part(description_clean, ',', 2)), '') || ' ', '')
                || split_part(description_clean, ',', 1)), '[^a-z0-9 ]+|\\y(assembly|assy|asy|kit|complete|set|of|only)\\y', ' ', 'g'), '\\s+', ' ', 'g')) AS joined
       FROM oem_parts WHERE description_clean IS NOT NULL)
     SELECT oem_display AS oem, chain_root, description_clean AS name, word_similarity($1, joined) AS ws
     FROM named
     WHERE regexp_replace(joined, 's$', '') ~ ('\\y' || $2 || '$')
       AND NOT EXISTS (SELECT 1 FROM unnest($3::text[]) w WHERE joined !~ ('\\y' || w))
     ORDER BY ws DESC, oem_display LIMIT 400`,
    [words.join(' '), noun, required]
  );
  return parts;
}

// Our parts named like the part name; then per year the chains on that family.
export async function ourSide(match: string, family: string, from: number, to: number) {
  const parts = await partsNamedLike(match);
  if (!parts.length) return { parts: [], years: [] as { year: number; chains: string[] }[] };
  const years = await query<{ year: number; chains: string[] }>(
    `SELECT v.year, array_agg(DISTINCT p.chain_root ORDER BY p.chain_root) AS chains
     FROM fitment f JOIN vehicles v USING (vehicle_id) JOIN oem_parts p USING (oem_number)
     WHERE p.oem_number = ANY($1) AND v.platform = $2 AND v.year BETWEEN $3 AND $4 AND f.confidence IN ('high', 'medium')
     GROUP BY v.year ORDER BY v.year`,
    [parts.map((p) => p.oem.replace(/-/g, '').toUpperCase()), family, from, to]
  );
  const fitChains = new Set(years.flatMap((y) => y.chains));
  return { parts: parts.filter((p) => fitChains.has(p.chain_root)), years };
}

// Ours: a change year is where the set of chains differs from the year before (both years listed).
export function ourBreaks(years: { year: number; chains: string[] }[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < years.length; i++) {
    if (years[i].year !== years[i - 1].year + 1) continue;
    if (years[i].chains.join('|') !== years[i - 1].chains.join('|')) out.push(years[i].year);
  }
  return out;
}

export { breaksOf };

// Each chain's numbers in supersession order (oldest first) and its superseded-by steps.
export async function chainMembers(roots: string[]) {
  if (!roots.length) return new Map<string, { members: string[]; steps: [string, string][] }>();
  const mem = await query<{ chain_root: string; oem: string }>(
    `SELECT chain_root, oem_display AS oem FROM oem_parts WHERE chain_root = ANY($1) ORDER BY chain_root, oem_display`, [roots]);
  const steps = await query<{ chain_root: string; f: string; t: string }>(
    `SELECT pf.chain_root, pf.oem_display AS f, pt.oem_display AS t FROM oem_supersession s
     JOIN oem_parts pf ON pf.oem_number = s.from_oem JOIN oem_parts pt ON pt.oem_number = s.to_oem
     WHERE pf.chain_root = ANY($1)`, [roots]);
  const out = new Map<string, { members: string[]; steps: [string, string][] }>();
  for (const m of mem) (out.get(m.chain_root) ?? out.set(m.chain_root, { members: [], steps: [] }).get(m.chain_root)!).members.push(m.oem);
  for (const s of steps) out.get(s.chain_root)?.steps.push([s.f, s.t]);
  // order: numbers that are only ever "from" come first, the chain root (newest) last
  for (const [root, c] of out) {
    const later = new Set(c.steps.map((s) => s[1]));
    const rootDisp = c.members.find((m) => m.replace(/-/g, '').toUpperCase() === root) ?? c.members[0];
    c.members.sort((a, z) => Number(a === rootDisp) - Number(z === rootDisp) || Number(later.has(a)) - Number(later.has(z)) || a.localeCompare(z));
  }
  return out;
}
