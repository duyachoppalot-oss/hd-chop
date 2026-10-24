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

// Names that say nothing on their own ("FENDER", "LENS ASSEMBLY") get a concept
// from the catalog sections they're listed in (hd_oem_catalog_reference.category,
// used internally only). Each rule whose `name` fits counts the part's rows in
// sections matching `section` and `side`. Rules for the same name compete (a
// "LENS" can be head, turn or tail lamp); the winner needs >= 75% of the votes
// and >= 25% of the part's rows. Section names are noisy: "INTERNATIONAL MODELS
// ONLY" holds 127 bare FENDER rows (ignored), fender 59045-00B sits in 1 "FRONT
// FENDER" + 2 "FAIRING LOWERS - ULTRA" rows, and turn-signal lens 68973-00 has 3
// "NACELLE AND HEADLAMP" rows among ~200 in turn-signal, fuel-tank-trim and
// throttle sections.
const GENERIC_FENDER = /^fender( assembly)?(, (prime|primed))?$/i;
const GENERIC_LENS = /^lens( assembly)?$/i;
export const SECTION_RULES = [
  { slug: 'front_fender', name: GENERIC_FENDER, section: /FENDER/, side: /\bFRONT\b/ },
  { slug: 'rear_fender', name: GENERIC_FENDER, section: /FENDER/, side: /\bREAR\b/ },
  { slug: 'headlamp', name: GENERIC_LENS, section: /HEAD ?LAMP|HEADLIGHT/, side: /./ },
  { slug: 'turn_signal', name: GENERIC_LENS, section: /TURN SIGNAL/, side: /./ },
  { slug: 'tail_lamp', name: GENERIC_LENS, section: /TAIL ?LAMP/, side: /./ },
];
const IGNORED_SECTION = /^INTERNATIONAL MODELS ONLY$/;
const MIN_VOTE_SHARE = 0.75;
const MIN_ROW_SHARE = 0.25;

// sections: Map(upper-case section name -> rows). Returns slug or null.
export function matchBySection(description, sections) {
  let total = 0;
  for (const [s, rows] of sections) if (!IGNORED_SECTION.test(s)) total += rows;
  const votes = new Map();
  for (const rule of SECTION_RULES) {
    if (!rule.name.test(description)) continue;
    let n = 0;
    for (const [s, rows] of sections) if (rule.section.test(s) && rule.side.test(s)) n += rows;
    if (n) votes.set(rule.slug, n);
  }
  if (!votes.size) return null;
  const all = [...votes.values()].reduce((a, b) => a + b, 0);
  const [slug, n] = [...votes].sort((a, b) => b[1] - a[1])[0];
  return n >= MIN_VOTE_SHARE * all && n >= MIN_ROW_SHARE * total ? slug : null;
}
