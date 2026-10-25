// scripts/dev/concept_gaps.mjs — read-only: where a search concept goes quiet.
// For each concept and platform, the model-years that have parts but no part of that
// concept, inside or before the concept's covered span. A gap usually means the old
// catalogs name the part differently (1980 throttle = "Control wire assembly"), so each
// gap lists the untagged part names in those years that share a word with the concept.
//   node scripts/dev/concept_gaps.mjs > reports/concept_gaps.txt 2>&1
//   node scripts/dev/concept_gaps.mjs --min-share 0.5     only concepts on >= 50% of a platform's years

import 'dotenv/config';
import pg from 'pg';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
const MIN_SHARE = Number(arg('--min-share', '0.4'));
const c = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
await c.connect();
const q = async (s, p = []) => (await c.query(s, p)).rows;

const concepts = await q(`SELECT concept_id, slug, display_name, hd_terms FROM part_concepts ORDER BY slug`);
// platform | year -> has any fitment
const pyRows = await q(`SELECT DISTINCT v.platform, v.year FROM fitment f JOIN vehicles v USING (vehicle_id) WHERE v.platform IS NOT NULL`);
const platYears = new Map();
for (const r of pyRows) (platYears.get(r.platform) ?? platYears.set(r.platform, new Set()).get(r.platform)).add(r.year);
const cov = await q(`SELECT p.concept_id, v.platform, v.year FROM oem_parts p JOIN fitment f USING (oem_number) JOIN vehicles v USING (vehicle_id)
                     WHERE p.concept_id IS NOT NULL AND v.platform IS NOT NULL GROUP BY 1, 2, 3`);
const covered = new Map(); // concept|platform -> Set(year)
for (const r of cov) { const k = `${r.concept_id}|${r.platform}`; (covered.get(k) ?? covered.set(k, new Set()).get(k)).add(r.year); }

const STOP = new Set(['assembly', 'kit', 'and', 'the', 'of', 'front', 'rear', 'left', 'right', 'side', 'set', 'with', 'inch']);
const words = (con) => [...new Set([con.display_name, ...con.hd_terms].join(' ').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !STOP.has(w)))];

const runs = (ys) => { // [1980,1981,1983] -> "1980-81, 1983"
  const out = []; let a = null, b = null;
  for (const y of [...ys].sort()) { if (b != null && y === b + 1) b = y; else { if (a != null) out.push(a === b ? `${a}` : `${a}-${String(b).slice(2)}`); a = b = y; } }
  if (a != null) out.push(a === b ? `${a}` : `${a}-${String(b).slice(2)}`);
  return out.join(', ');
};

const L = [];
let total = 0;
for (const con of concepts) {
  const blocks = [];
  for (const [plat, ys] of platYears) {
    const have = covered.get(`${con.concept_id}|${plat}`);
    if (!have || have.size / ys.size < MIN_SHARE) continue;
    const last = Math.max(...have);
    // Missing years up to the last covered one: holes inside the span and years before it.
    const miss = [...ys].filter((y) => y <= last && !have.has(y)).sort();
    if (!miss.length) continue;
    const ws = words(con);
    const cands = ws.length
      ? await q(
          `SELECT p.oem_display, p.description_clean, count(DISTINCT v.year)::int AS yrs
           FROM oem_parts p JOIN fitment f USING (oem_number) JOIN vehicles v USING (vehicle_id)
           WHERE p.concept_id IS NULL AND v.platform = $1 AND v.year = ANY($2) AND p.description_clean ~* $3
           GROUP BY 1, 2 ORDER BY 3 DESC, 2 LIMIT 6`,
          [plat, miss, `\\y(${ws.join('|')})`]
        )
      : [];
    blocks.push(`  ${plat.padEnd(14)} missing ${runs(miss)}  (covered ${have.size}/${ys.size} yrs)` +
      (cands.length ? '\n' + cands.map((x) => `      ? ${x.oem_display.padEnd(11)} ${x.description_clean.slice(0, 60)} (${x.yrs} yr)`).join('\n') : ''));
    total += miss.length;
  }
  if (blocks.length) L.push(`${con.slug} — ${con.display_name}\n${blocks.join('\n')}`);
}
console.log(`Concept gaps: ${L.length} concepts, ${total} platform-years with parts but none of the concept (before the concept's last covered year).`);
console.log(`"?" = untagged parts in those years sharing a word with the concept: candidates for new wording in data/seed/concepts_seed.csv.\n`);
console.log(L.join('\n\n'));
await c.end();
