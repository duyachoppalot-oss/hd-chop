// scripts/etl/lib/concepts.mjs
//
// Part name -> concept matching, shared by 06_concepts (assigns every part)
// and 09_service_catalog (previews concepts for parts it would add). See
// 06_concepts.mjs for the rules.

import fs from 'node:fs';

export const SEED = 'data/seed/concepts_seed.csv';

const FILLER = /\b(assembly|assy|asy|kit|complete|set)\b/g;

const clean = (s) => s.toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s).replace(FILLER, ' ').replace(/\s+/g, ' ').trim();

// Seed CSV: no quoted commas in this file; arrays are pipe-separated.
export function readSeed(file = SEED) {
  const [header, ...lines] = fs.readFileSync(file, 'utf8').trim().split('\n');
  const cols = header.split(',');
  return lines.map((l) => {
    const v = l.split(',');
    const r = Object.fromEntries(cols.map((c, i) => [c, v[i] ?? '']));
    const arr = (s) => s.split('|').map((x) => x.trim()).filter(Boolean);
    return { ...r, match: r.match || 'head', hd_terms: arr(r.hd_terms), user_terms: arr(r.user_terms), exclude: arr(r.exclude_terms ?? '').map(clean) };
  });
}

export function phrases(description) {
  const out = new Set();
  for (const f of [clean, norm]) {
    const segs = description.split(/,|\s-\s/).map(f).filter(Boolean); // "Wiring harness - fairing"
    if (!segs.length) continue;
    out.add(segs[0]);
    if (segs[1]) out.add(`${segs[1]} ${segs[0]}`.trim());
  }
  return [...out];
}

const endsWith = (phrase, term) => phrase === term || phrase.endsWith(` ${term}`);
const contains = (phrase, term) => ` ${phrase} `.includes(` ${term} `);

export function seedTerms(concepts) {
  return concepts.flatMap((c) => c.hd_terms.map((t) => ({ slug: c.slug, raw: t, t: clean(t), mode: c.match, exclude: c.exclude })));
}

// One part name -> { slug, term } | { tie: [slugs] } | { none: headPhrase }.
// A head match beats a contains match; then the longest term wins.
export function matchConcept(terms, description) {
  const ph = phrases(description);
  const hits = terms.filter(
    (x) =>
      x.t &&
      ph.some((q) => (x.mode === 'contains' ? contains(q, x.t) : endsWith(q, x.t))) &&
      !x.exclude.some((e) => ph.some((q) => contains(q, e)))
  );
  if (!hits.length) return { none: ph[0] };
  const pool = hits.some((x) => x.mode === 'head') ? hits.filter((x) => x.mode === 'head') : hits;
  const best = Math.max(...pool.map((x) => x.t.length));
  const top = pool.filter((x) => x.t.length === best);
  const slugs = [...new Set(top.map((x) => x.slug))];
  if (slugs.length > 1) return { tie: slugs };
  return { slug: slugs[0], term: top[0] };
}
