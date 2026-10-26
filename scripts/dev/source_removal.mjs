// scripts/dev/source_removal.mjs — read-only (docs/FIX_PLAN.md B1).
// For each removable source, what the app loses if it is pulled:
//   fitment rows, parts, supersession pairs, concepts only it supplies;
//   bikes (year + model) that drop to zero parts or under 100;
//   the 25 gate cells (apps/api/scripts/gate.mjs) recomputed without it.
//
// Nothing live is changed: one transaction on APP_DATABASE_URL with TEMP tables only,
// ROLLBACK at the end. Removal follows the DELETEs in migrations 003/007/009:
// fitment.source = S, plus every row of a part whose oem_parts.source = S, plus the part.
// Bridged rows (fitment.source = 'inferred_span', 07) go too when their part has no
// other real row on that model code left (07 bridges between real rows).
// Supersession pairs: from the newest reports/05_supersession_pairs_*.csv (05 dry run);
// a live pair is lost if only S gives it, or its from/to part is removed.
// Not modelled: names, concepts or conditions another source gave a surviving part,
// chain roots recomputed after pairs drop (gate cells count current chain roots).
//
// Usage: node scripts/dev/source_removal.mjs > reports/out_source_removal.txt 2>&1
//        -> reports/source_removal_<ts>.txt

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const SOURCES = ['service_catalog', 'hydra_glide', 'catalog_ocr'];
const GATE_BIKES = [[2004, 'FLHR'], [2010, 'FLHX'], [2005, 'FLSTC'], [2004, 'FXDL'], [2004, 'XL883']];
const GATE_WORDS = ['gas tank', 'blinkers', 'bags', 'kickstand', 'speedo'];
const singular = (q) => q.replace(/(ss|us)$/, '$1').replace(/(x|ch|sh)es$/, '$1').replace(/([^s])s$/, '$1');

const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const out = [];
const say = (s = '') => { out.push(s); console.log(s); };
const n = (x) => Number(x).toLocaleString('en-US');

const c = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
await c.connect();
const q = async (sql, args) => (await c.query(sql, args)).rows;

await c.query('BEGIN');
try {
  // Every fitment row with what we need to judge it.
  await c.query(`
    CREATE TEMP TABLE f ON COMMIT DROP AS
    SELECT fi.oem_number, fi.vehicle_id, fi.source, fi.conditions, fi.confidence IN ('high','medium') AS shown,
           p.source AS psource, p.concept_id, p.chain_root, v.model_code, v.year, v.platform
    FROM fitment fi JOIN oem_parts p USING (oem_number) JOIN vehicles v USING (vehicle_id)`);

  // Supersession pairs with their sources.
  const pairsFile = fs.readdirSync('reports').filter((x) => /^05_supersession_pairs_.*\.csv$/.test(x)).sort().at(-1);
  if (!pairsFile) throw new Error('no reports/05_supersession_pairs_*.csv: run node scripts/etl/05_supersession.mjs (dry run) first');
  const pairSources = new Map();
  for (const line of fs.readFileSync(path.join('reports', pairsFile), 'utf8').trim().split('\n').slice(1)) {
    const [from, to, sources] = line.split(',');
    pairSources.set(`${from}|${to}`, sources.split(' '));
  }
  const livePairs = await q(`SELECT s.from_oem, s.to_oem, pf.source AS from_src, pt.source AS to_src
                             FROM oem_supersession s LEFT JOIN oem_parts pf ON pf.oem_number = s.from_oem
                             LEFT JOIN oem_parts pt ON pt.oem_number = s.to_oem`);
  const unattributed = livePairs.filter((p) => !pairSources.has(`${p.from_oem}|${p.to_oem}`)).length;

  // Gate cells: concept like resolveConcepts (exact forms; results[0] = lowest concept_id).
  const cells = [];
  for (const [year, model] of GATE_BIKES)
    for (const word of GATE_WORDS) {
      const [con] = await q(
        `SELECT DISTINCT c.concept_id, c.display_name FROM part_concepts c, unnest(c.user_terms || c.hd_terms || ARRAY[c.display_name]) t
         WHERE lower(t) = ANY($1::text[]) ORDER BY c.concept_id LIMIT 1`,
        [[...new Set([word, singular(word)])]]
      );
      const [veh] = await q(`SELECT vehicle_id FROM vehicles WHERE year = $1 AND model_code = $2`, [year, model]);
      cells.push({ year, model, word, concept_id: con?.concept_id ?? null, concept: con?.display_name ?? 'no concept', vehicle_id: veh?.vehicle_id });
    }
  const gateCount = async (table) => {
    const res = [];
    for (const cell of cells) {
      if (!cell.concept_id || !cell.vehicle_id) { res.push(0); continue; }
      const [r] = await q(
        `SELECT count(DISTINCT (chain_root, conditions))::int AS n FROM ${table}
         WHERE vehicle_id = $1 AND concept_id = $2 AND shown ${table === 'k' ? 'AND keep' : ''}`,
        [cell.vehicle_id, cell.concept_id]
      );
      res.push(r.n);
    }
    return res;
  };
  const gateBefore = await gateCount('f');

  await c.query(`CREATE INDEX ON f (vehicle_id)`);
  // Baseline per bike.
  await c.query(`CREATE TEMP TABLE bike0 ON COMMIT DROP AS
                 SELECT v.vehicle_id, v.year, v.model_code, v.platform,
                        (SELECT count(DISTINCT oem_number) FROM f WHERE f.vehicle_id = v.vehicle_id AND f.shown) AS parts
                 FROM vehicles v`);
  const [tot] = await q(`SELECT count(*) AS rows, count(*) FILTER (WHERE shown) AS shown_rows FROM f`);
  const [bikes0] = await q(`SELECT count(*) FILTER (WHERE parts > 0) AS with_parts, count(*) FILTER (WHERE parts >= 100) AS over100 FROM bike0`);

  say(`Source-removal report — ${new Date().toISOString()} — read-only (temp tables, rolled back)`);
  say(`Live now: ${n(tot.rows)} fitment rows (${n(tot.shown_rows)} shown, confidence high/medium), ` +
      `${n((await q(`SELECT count(*) FROM oem_parts`))[0].count)} parts, ${n(livePairs.length)} supersession pairs, ` +
      `${n(bikes0.with_parts)} bikes with parts (${n(bikes0.over100)} with 100+).`);
  say(`Fitment by source: ${(await q(`SELECT source, count(*) FROM fitment GROUP BY 1 ORDER BY 2 DESC`)).map((r) => `${r.source} ${n(r.count)}`).join(', ')}`);
  say(`Supersession sources from ${pairsFile}; live pairs not in that file (left as kept): ${unattributed}`);
  say(`"Parts" on a bike = distinct OEM numbers shown for it. Gate cell = part groups (chain root + conditions), as gate.mjs counts.`);

  const summary = [];
  for (const S of SOURCES) {
    await c.query(`DROP TABLE IF EXISTS k`);
    await c.query(
      `CREATE TEMP TABLE k AS
       WITH a AS (SELECT f.*, (source <> $1 AND psource <> $1) AS k0 FROM f),
       b AS (SELECT a.*, bool_or(k0 AND source <> 'inferred_span') OVER (PARTITION BY oem_number, model_code) AS has_real FROM a)
       SELECT b.*, (k0 AND (source <> 'inferred_span' OR has_real)) AS keep,
              CASE WHEN source = $1 THEN 'row_source' WHEN psource = $1 THEN 'part_source'
                   WHEN source = 'inferred_span' AND NOT has_real THEN 'bridge' END AS why
       FROM b`,
      [S]
    );
    await c.query(`CREATE INDEX ON k (vehicle_id)`);

    say('');
    say('='.repeat(78));
    say(`WITHOUT ${S}`);
    say('='.repeat(78));

    const lost = await q(`SELECT why, count(*) AS rows, count(*) FILTER (WHERE shown) AS shown FROM k WHERE NOT keep GROUP BY 1 ORDER BY 2 DESC`);
    const lostRows = lost.reduce((s, r) => s + Number(r.rows), 0);
    say(`Fitment rows lost: ${n(lostRows)} of ${n(tot.rows)} (${((100 * lostRows) / tot.rows).toFixed(1)}%)`);
    for (const r of lost) say(`  ${r.why.padEnd(12)} ${n(r.rows)} (${n(r.shown)} shown)`);

    const [pp] = await q(
      `SELECT (SELECT count(*) FROM oem_parts WHERE source = $1) AS removed,
              (SELECT count(*) FROM oem_parts WHERE source = $1 AND concept_id IS NOT NULL) AS removed_concept,
              (SELECT count(*) FROM (SELECT oem_number FROM k WHERE psource <> $1 GROUP BY 1 HAVING bool_or(shown) AND NOT bool_or(keep AND shown)) x) AS orphaned,
              (SELECT count(*) FROM (SELECT oem_number FROM k WHERE psource <> $1 GROUP BY 1 HAVING bool_or(shown) AND NOT bool_or(keep AND shown)) x
                 JOIN oem_parts p USING (oem_number) WHERE p.concept_id IS NOT NULL) AS orphaned_concept`,
      [S]
    );
    say(`Parts: ${n(pp.removed)} removed with the source (${n(pp.removed_concept)} searchable by a concept); ` +
        `${n(pp.orphaned)} parts from other sources left with no shown fitment (${n(pp.orphaned_concept)} searchable).`);

    const removedParts = new Set((await q(`SELECT oem_number FROM oem_parts WHERE source = $1`, [S])).map((r) => r.oem_number));
    let onlyS = 0, partGone = 0;
    for (const p of livePairs) {
      const srcs = pairSources.get(`${p.from_oem}|${p.to_oem}`);
      if (removedParts.has(p.from_oem) || removedParts.has(p.to_oem)) partGone++;
      else if (srcs && srcs.every((x) => x === S)) onlyS++;
    }
    say(`Supersession pairs lost: ${n(onlyS + partGone)} of ${n(livePairs.length)} (only ${S} gives the pair: ${n(onlyS)}; ` +
        `a number in the pair is a ${S} part: ${n(partGone)}).`);

    const concepts = await q(
      `SELECT c.display_name, count(DISTINCT k.vehicle_id) AS bikes FROM k JOIN part_concepts c USING (concept_id)
       WHERE k.shown GROUP BY c.concept_id, c.display_name HAVING NOT bool_or(k.keep) ORDER BY 2 DESC`
    );
    say(`Concepts left with no parts on any bike: ${concepts.length}${concepts.length ? ` — ${concepts.map((r) => `${r.display_name} (${r.bikes} bikes)`).join(', ')}` : ''}`);
    const [cb] = await q(
      `SELECT count(*) AS pairs FROM (SELECT vehicle_id, concept_id FROM k WHERE shown AND concept_id IS NOT NULL GROUP BY 1, 2 HAVING NOT bool_or(keep)) x`
    );
    say(`Bike + concept pairs that go empty (a search that answered now finds nothing): ${n(cb.pairs)}`);

    const bikes = await q(
      `SELECT b.vehicle_id, b.year, b.model_code, b.platform, b.parts AS before,
              (SELECT count(DISTINCT oem_number) FROM k WHERE k.vehicle_id = b.vehicle_id AND k.shown AND k.keep) AS after
       FROM bike0 b WHERE b.parts > 0`
    );
    const zero = bikes.filter((b) => Number(b.after) === 0);
    const under100 = bikes.filter((b) => Number(b.after) > 0 && Number(b.after) < 100 && Number(b.before) >= 100);
    const byPlat = (list) => {
      const m = {};
      for (const b of list) (m[b.platform] ||= []).push(b);
      return Object.entries(m).sort((a, b) => b[1].length - a[1].length)
        .map(([p, l]) => `${p} ${l.length} (${Math.min(...l.map((x) => x.year))}-${Math.max(...l.map((x) => x.year))})`).join(', ');
    };
    say(`Bikes that drop to zero parts: ${zero.length} of ${n(bikes.length)}${zero.length ? ` — by platform: ${byPlat(zero)}` : ''}`);
    for (const b of zero.sort((a, b) => a.year - b.year || a.model_code.localeCompare(b.model_code)).slice(0, 40))
      say(`  ${b.year} ${b.model_code.padEnd(10)} ${b.platform.padEnd(12)} ${b.before} -> 0`);
    if (zero.length > 40) say(`  … ${zero.length - 40} more`);
    say(`Bikes that drop from 100+ to under 100 parts: ${under100.length}${under100.length ? ` — by platform: ${byPlat(under100)}` : ''}`);
    for (const b of under100.sort((a, b) => a.after - b.after).slice(0, 25))
      say(`  ${b.year} ${b.model_code.padEnd(10)} ${b.platform.padEnd(12)} ${b.before} -> ${b.after}`);
    if (under100.length > 25) say(`  … ${under100.length - 25} more (worst 25 shown)`);
    const all = bikes.reduce((s, b) => s + Number(b.before), 0), left = bikes.reduce((s, b) => s + Number(b.after), 0);
    say(`Bike-part pairs kept overall: ${((100 * left) / all).toFixed(1)}%`);

    const gateAfter = await gateCount('k');
    say('Gate cells (part groups now -> without the source):');
    let changed = 0;
    for (let i = 0; i < cells.length; i++) {
      const cl = cells[i];
      const mark = gateAfter[i] === 0 && gateBefore[i] > 0 ? '  EMPTY' : gateAfter[i] < gateBefore[i] ? '  fewer' : '';
      if (mark) changed++;
      say(`  ${String(cl.year)} ${cl.model.padEnd(6)} ${cl.word.padEnd(10)} ${cl.concept.padEnd(14)} ${String(gateBefore[i]).padStart(3)} -> ${String(gateAfter[i]).padStart(3)}${mark}`);
    }
    say(`Gate cells changed: ${changed} of ${cells.length}`);
    summary.push(`${S.padEnd(16)} rows -${((100 * lostRows) / tot.rows).toFixed(1)}%, parts -${n(pp.removed)}, pairs -${n(onlyS + partGone)}, ` +
                 `bikes to zero ${zero.length}, 100+ -> <100 ${under100.length}, gate cells changed ${changed}/25`);
  }
  say('');
  say('SUMMARY');
  for (const s of summary) say(`  ${s}`);
} finally {
  await c.query('ROLLBACK');
  await c.end();
}

const file = path.join('reports', `source_removal_${ts}.txt`);
fs.writeFileSync(file, out.join('\n') + '\n');
console.log(`\nReport written to ${file}`);
