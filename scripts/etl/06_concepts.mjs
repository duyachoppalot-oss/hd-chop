// scripts/etl/06_concepts.mjs
//
// Loads part_concepts from data/seed/concepts_seed.csv and sets
// oem_parts.concept_id by matching hd_terms against description_clean
// (ETL_PLAN step 06).
//
// Catalog names put the noun first: "Cover, primary", "Tank, fuel",
// "Wheel assembly, rear". Each name gives two phrases:
//   head   = first segment                        "cover" / "fuel tank"
//   joined = second segment + " " + first segment "primary cover" / "rear wheel"
// each also with filler words (assembly, assy, kit, complete, set) dropped, so
// "Wheel assembly, rear" matches "rear wheel" and "Pad kit" still matches
// "pad kit". Seed column `match`:
//   head      a phrase must END with the term, so the noun agrees: "Gasket,
//             primary cover" is a gasket, not a primary cover
//   contains  the term may appear anywhere: component families named
//             "Bottom, tour-pak", "Cover, air cleaner"
// `exclude_terms` (matched anywhere in the name) keep a part out ("seat
// fairing", "clutch master cylinder").
// A head match beats a contains match; then the longest term wins; equal ties
// go to review.
//
// The report counts parts per term; 0-match terms are fixed in the seed file
// from real wording before --apply (SPEC "Seeds").
//
// --apply upserts part_concepts by slug and rewrites concept_id for every part.
// Refresh fitment_spans afterwards (08).
//
// Usage:
//   node scripts/etl/06_concepts.mjs            (dry-run, prints + writes report only)
//   node scripts/etl/06_concepts.mjs --apply    (writes to APP_DATABASE_URL)

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const SEED = 'data/seed/concepts_seed.csv';

const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

const FILLER = /\b(assembly|assy|asy|kit|complete|set)\b/g;

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
}

const clean = (s) => s.toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s).replace(FILLER, ' ').replace(/\s+/g, ' ').trim();

// Seed CSV: no quoted commas in this file; arrays are pipe-separated.
function readSeed() {
  const [header, ...lines] = fs.readFileSync(SEED, 'utf8').trim().split('\n');
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

async function main() {
  const concepts = readSeed();
  const terms = concepts.flatMap((c) => c.hd_terms.map((t) => ({ slug: c.slug, raw: t, t: clean(t), mode: c.match, exclude: c.exclude })));
  const parts = (
    await app.query(`
      SELECT p.oem_number, p.oem_display, p.description_clean, count(f.*)::int AS fit
      FROM oem_parts p LEFT JOIN fitment f USING (oem_number)
      GROUP BY 1, 2, 3
    `)
  ).rows;

  const assigned = new Map(); // oem_number -> slug
  const termHits = new Map(terms.map((x) => [`${x.slug}|${x.raw}`, []]));
  const ties = [];
  const unmatched = new Map(); // head phrase -> { parts, fit }
  for (const p of parts) {
    if (!p.description_clean) continue;
    const ph = phrases(p.description_clean);
    const hits = terms.filter(
      (x) =>
        x.t &&
        ph.some((q) => (x.mode === 'contains' ? contains(q, x.t) : endsWith(q, x.t))) &&
        !x.exclude.some((e) => ph.some((q) => contains(q, e)))
    );
    if (!hits.length) {
      const h = ph[0];
      const e = unmatched.get(h) ?? { parts: 0, fit: 0 };
      e.parts++; e.fit += p.fit;
      unmatched.set(h, e);
      continue;
    }
    const pool = hits.some((x) => x.mode === 'head') ? hits.filter((x) => x.mode === 'head') : hits;
    const best = Math.max(...pool.map((x) => x.t.length));
    const top = pool.filter((x) => x.t.length === best);
    const slugs = [...new Set(top.map((x) => x.slug))];
    if (slugs.length > 1) { ties.push(`${p.oem_display} "${p.description_clean}" -> ${slugs.join(' / ')}`); continue; }
    assigned.set(p.oem_number, slugs[0]);
    termHits.get(`${top[0].slug}|${top[0].raw}`).push(p);
  }

  // ---- report ----
  const lines = [];
  const fitOf = (slug) => parts.filter((p) => assigned.get(p.oem_number) === slug).reduce((n, p) => n + p.fit, 0);
  lines.push(`06_concepts.mjs — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  lines.push(`Concepts in seed: ${concepts.length}; hd_terms: ${terms.length}`);
  lines.push(`Parts: ${parts.length}; with a name: ${parts.filter((p) => p.description_clean).length}; assigned a concept: ${assigned.size}; ties (review): ${ties.length}`);
  lines.push(`Fitment rows on assigned parts: ${parts.filter((p) => assigned.has(p.oem_number)).reduce((n, p) => n + p.fit, 0)} of ${parts.reduce((n, p) => n + p.fit, 0)}`);
  lines.push('');
  const zero = terms.filter((x) => !termHits.get(`${x.slug}|${x.raw}`).length);
  lines.push(`hd_terms with 0 matches (${zero.length}): ${zero.map((x) => `${x.slug}:"${x.raw}"`).join(', ')}`);
  const emptyConcepts = concepts.filter((c) => !assigned.size || ![...assigned.values()].includes(c.slug));
  lines.push(`Concepts with 0 parts (${emptyConcepts.length}): ${emptyConcepts.map((c) => c.slug).join(', ')}`);
  lines.push('');
  lines.push('Per concept: parts / fitment rows; per term: parts; 4 sample names');
  for (const c of concepts) {
    const n = [...assigned.values()].filter((s) => s === c.slug).length;
    lines.push(`  ${c.slug.padEnd(20)} ${String(n).padStart(5)} / ${String(fitOf(c.slug)).padStart(7)}`);
    for (const t of c.hd_terms) {
      const hs = termHits.get(`${c.slug}|${t}`);
      const step = Math.max(1, Math.floor(hs.length / 4));
      lines.push(`      "${t}": ${hs.length}  ${hs.filter((_, i) => i % step === 0).slice(0, 4).map((p) => `${p.oem_display} ${p.description_clean}`).join(' | ').slice(0, 150)}`);
    }
  }
  lines.push('');
  lines.push('Top 60 unmatched head phrases by fitment rows (parts / fitment):');
  for (const [h, e] of [...unmatched].sort((a, b) => b[1].fit - a[1].fit).slice(0, 60))
    lines.push(`  ${h.padEnd(30)} ${String(e.parts).padStart(5)} / ${String(e.fit).padStart(7)}`);
  lines.push('');
  lines.push(`Ties (first 20 of ${ties.length}):`);
  lines.push(...ties.slice(0, 20).map((t) => `  ${t}`));

  const reportPath = path.join('reports', `06_concepts_${timestamp()}.txt`);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\nReport written to ${reportPath}`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write to APP_DATABASE_URL.');
    return;
  }

  const client = await app.connect();
  try {
    await client.query('BEGIN');
    for (const c of concepts)
      await client.query(
        `INSERT INTO part_concepts (slug, display_name, category, hd_terms, user_terms) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name, category = EXCLUDED.category,
           hd_terms = EXCLUDED.hd_terms, user_terms = EXCLUDED.user_terms`,
        [c.slug, c.display_name, c.category, c.hd_terms, c.user_terms]
      );
    await client.query(`UPDATE oem_parts SET concept_id = NULL WHERE concept_id IS NOT NULL`);
    const entries = [...assigned];
    const res = await client.query(
      `UPDATE oem_parts p SET concept_id = c.concept_id
       FROM unnest($1::text[], $2::text[]) AS x(n, s) JOIN part_concepts c ON c.slug = x.s
       WHERE p.oem_number = x.n`,
      [entries.map(([n]) => n), entries.map(([, s]) => s)]
    );
    await client.query('COMMIT');
    console.log(`Upserted ${concepts.length} concepts; set concept_id on ${res.rowCount} parts.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => app.end());
