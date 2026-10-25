// Model families: which model codes are the same named bike, so the app can
// fold FLHR, FLHRC, FLHRCI, FLHRS... into one "Road King" row. Pure (no DB),
// built from vehicles rows; see families.ts for the loader.
//
// Rule, per platform (codes are reused across platforms, e.g. FLHC fl/softail):
//   1. Code: a code belongs under the shortest other code of 4+ characters on
//      its platform that it starts with (FLHRCI -> FLHR, FLHTCU -> FLHT).
//   2. Name split (not touring/trike): walking down that code chain, a code
//      whose cleaned name doesn't start with its parent's starts its own
//      family (FLSTF "FAT BOY" under FLST "HERITAGE SOFTAIL"). Touring codes
//      are regular enough that the code alone decides (Ultras under FLHT).
//   3. Name merge: a family whose cleaned name starts with another family's
//      name on the same platform joins it (FLHP "ROAD KING POLICE" -> Road
//      King, FLSTF + FLFB both "FAT BOY", XLH1200 + XL1200).
// Cleaned name: uppercase, without leading CVO / SCREAMIN EAGLE / DYNA and the
// trailing " I" (EFI variant).

export type FamilyVehicle = { platform: string; model_code: string; model_name: string | null; year: number };
export type Family = { key: string; name: string | null };

const CODE_ONLY = new Set(['touring', 'trike']);
const MIN_ROOT = 4;
// Platform names that are model names too ("Sportster" 1957); never a family.
const PLATFORM_NAMES = new Set(['SPORTSTER', 'SOFTAIL', 'DYNA']);

export function cleanName(n: string | null): string | null {
  if (!n) return null;
  const up = n.toUpperCase().replace(/\s+/g, ' ').trim();
  const c = up
    .replace(/^(CVO|SCREAMIN EAGLE) /, '')
    .replace(/^DYNA /, '')
    .replace(/ I$/, '')
    .trim();
  return c || up;
}

const startsWords = (n: string, base: string) => n === base || n.startsWith(base + ' ');

// -> Map "platform:CODE" -> family
export function buildFamilies(rows: FamilyVehicle[]): Map<string, Family> {
  // Latest non-null name per platform + code.
  const latest = new Map<string, { year: number; name: string | null }>();
  for (const r of rows) {
    const k = `${r.platform}:${r.model_code}`;
    const cur = latest.get(k);
    if (!cur || (r.model_name && (!cur.name || r.year > cur.year))) latest.set(k, { year: r.year, name: r.model_name });
  }
  const byPlatform = new Map<string, Map<string, string | null>>();
  for (const [k, v] of latest) {
    const [p, code] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    if (!byPlatform.has(p)) byPlatform.set(p, new Map());
    byPlatform.get(p)!.set(code, cleanName(v.name));
  }

  const out = new Map<string, Family>();
  for (const [p, names] of byPlatform) {
    const codes = [...names.keys()];
    // 1 + 2: code chain, split on name break.
    const root = new Map<string, string>();
    for (const x of codes) {
      const chain = codes
        .filter((a) => a !== x && a.length >= MIN_ROOT && x.startsWith(a))
        .sort((a, b) => a.length - b.length)
        .concat(x);
      let r = chain[0];
      if (!CODE_ONLY.has(p)) {
        for (const a of chain.slice(1)) {
          const na = names.get(a), nr = names.get(r);
          if (na && nr && !startsWords(na, nr)) r = a;
        }
      }
      root.set(x, r);
    }
    // 3: merge families by name.
    const roots = [...new Set(root.values())];
    const target = new Map<string, string>();
    for (const r of roots) {
      const n = names.get(r);
      const into = n
        ? roots
            .filter((o) => {
              const no = names.get(o);
              return no && !PLATFORM_NAMES.has(no) && startsWords(n, no);
            })
            .sort((a, b) => names.get(a)!.length - names.get(b)!.length || a.length - b.length)[0]
        : undefined;
      target.set(r, into ?? r);
    }
    for (const x of codes) {
      const t = target.get(root.get(x)!)!;
      out.set(`${p}:${x}`, { key: `${p}:${t}`, name: names.get(t) ?? null });
    }
  }
  return out;
}
