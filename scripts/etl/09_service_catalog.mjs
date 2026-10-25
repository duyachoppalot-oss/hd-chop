// scripts/etl/09_service_catalog.mjs
//
// Second fitment source: HD parts catalogs scraped from the H-D service portal
// into catalog-extract/rows/*.tsv (DATA_RIGHTS.md row "HD parts catalogs
// scraped from the H-D service portal"). stinkin_catalog's year-range books
// are partial extracts (2004-touring: 22 of ~244 pages) with ~9% of part
// numbers cut at the hyphen; the TSVs have every page and whole numbers.
//
// TSV layout and book years: lib/servicecatalog.mjs (only 7-column lines are fitment).
//
// The models column has the same shapes as hd_oem_catalog_reference.used_on_raw,
// so rows go through the same parser and targeter as 03 (lib/usedon.mjs,
// lib/fitment.mjs): codes x book years (a year next to a code wins), ALL = codes
// listed in >= 2 rows of the same book. "SIDECAR FOR FLHR" and "FXRS CONV" are
// not the bike and go to review.
// Confidence as 03: high if oem_fitment has the number in a catalog covering
// that year, else medium; low for "early/late YY" boundary years.
// Conditions as 04 (lib/conditions.mjs) from the description + models text.
// The X/XI efi/carb inference is not repeated here.
//
// Merge: a (part, vehicle) pair already in 03's fitment (source = 'oem_catalog')
// is counted as agreement and left alone. Only new pairs are added, as
// source = 'service_catalog', source_ref = 'catalog_extract:<book>:<line>'.
// Numbers not in 02's parts are added to oem_parts with source =
// 'service_catalog' (number_source 'extracted', description_clean via
// cleanDescription, chain_root self, no concept: 05/06 set those). Concepts are
// previewed in the report with lib/concepts.mjs.
//
// --apply, in one transaction: deletes earlier service_catalog fitment and parts
// and all inferred_span rows (07 bridged holes against the old fitment), then
// inserts this run's parts and pairs. Afterwards re-run 05 -> 06 -> 07 and
// refresh fitment_spans. Run after 03/04 (03 --apply clears these rows).
// Removing the source: see packages/db/migrations/003_part_source.sql.
//
// Usage:
//   node scripts/etl/09_service_catalog.mjs > reports/09_out.txt 2>&1
//   CATALOG_EXTRACT_DIR=/path/to/catalog-extract node scripts/etl/09_service_catalog.mjs

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { makeTargeter } from './lib/fitment.mjs';
import { classify, normalize, cleanDescription } from './lib/parts.mjs';
import { rowConditions, marketTag, CONFLICTS } from './lib/conditions.mjs';
import { readSeed, seedTerms, matchConcept } from './lib/concepts.mjs';
import { readBooks, CATALOG_EXTRACT_DIR as DIR } from './lib/servicecatalog.mjs';

const APPLY = process.argv.includes('--apply');

const source = new pg.Pool({ connectionString: process.env.SOURCE_DATABASE_URL });
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

const CONF_RANK = { high: 0, medium: 1, low: 2 };
const VALID = new Set(['std', 'modern', 'hardware']);
const BATCH = 20000;

// Phase 2 gate bikes + the concepts riders asked for that came back empty.
const GATE_BIKES = [[2004, 'FLHR'], [2010, 'FLHX'], [2005, 'FLSTC'], [2004, 'FXDL'], [2004, 'XL883']];
const GATE_CONCEPTS = ['fuel_tank', 'turn_signal', 'saddlebag', 'jiffy_stand', 'speedometer', 'mirror', 'headlamp', 'seat', 'brake_rotor', 'front_fender', 'rear_fender', 'handlebar', 'primary_cover'];

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const { rows, lineKinds, books, noManifest } = readBooks();
  const fitmentSrc = (
    await source.query(`
      SELECT DISTINCT upper(trim(oem_part_no)) AS display, catalog_year_start AS year_start, catalog_year_end AS year_end
      FROM oem_fitment WHERE oem_part_no IS NOT NULL
    `)
  ).rows;
  const vehicles = (await app.query(`SELECT vehicle_id, year, model_code, platform FROM vehicles`)).rows;
  const existingParts = new Map(
    (
      await app.query(
        `SELECT p.oem_number, p.oem_display, p.chain_root, c.slug FROM oem_parts p LEFT JOIN part_concepts c USING (concept_id) WHERE p.source = 'oem_catalog'`
      )
    ).rows.map((r) => [r.oem_number, r])
  );
  const existingFit = new Map(); // oem|vehicle_id -> best confidence, 03's rows only
  for (const r of (await app.query(`SELECT oem_number || '|' || vehicle_id AS k, confidence FROM fitment WHERE source = 'oem_catalog'`)).rows) {
    const e = existingFit.get(r.k);
    if (!e || CONF_RANK[r.confidence] < CONF_RANK[e]) existingFit.set(r.k, r.confidence);
  }

  // Every whole number in the books counts as a part, so the targeter never
  // reports part_not_loaded; numbers not in oem_parts are tracked as new.
  const parts = new Set(existingParts.keys());
  for (const r of rows) {
    const { cls, display } = classify(r.part_number);
    if (VALID.has(cls)) parts.add(normalize(display));
  }

  const { target, confidence } = makeTargeter({ rows, fitmentSrc, vehicles, parts });

  const fit = new Map(); // oem|vehicle_id -> { conf, id, kind, tags, dom, cal, ids }
  const stat = { rows: rows.length, part_unresolved: 0, part_not_loaded: 0, bad_year: 0, unparsed: 0, no_vehicle: 0, with_fitment: 0 };
  const kindRows = {};
  const missingCodes = new Map();
  const review = new Map();
  const names = new Map(); // oem -> Map(cleaned name -> count), new parts only
  const displays = new Map(); // oem -> display
  const addReview = (reason, r, detail) => {
    const k = `${reason}|${r.doc}|${detail}`;
    const e = review.get(k);
    if (e) { e.rows++; if (e.example_ids.length < 3) e.example_ids.push(r.id); return; }
    review.set(k, { reason, doc: r.doc, detail, rows: 1, example_ids: [r.id] });
  };

  rows.forEach((r, i) => {
    const t = target(r, i);
    kindRows[t.kind] = (kindRows[t.kind] || 0) + 1;
    for (const c of t.missing) missingCodes.set(c, (missingCodes.get(c) || 0) + 1);
    for (const [reason, detail] of t.notes) addReview(reason, r, detail);
    if (t.status === 'part_unresolved') { stat.part_unresolved++; return; } // headers, notes, short bases
    if (t.status === 'part_not_loaded') { stat.part_not_loaded++; return; }
    if (t.status === 'bad_year') { stat.bad_year++; addReview('bad_year', r, t.reason); return; }
    if (t.status === 'unparsed') { stat.unparsed++; addReview(`unparsed:${t.reason}`, r, (r.used_on_raw || '').slice(0, 60)); return; }
    if (t.status === 'no_vehicle') { stat.no_vehicle++; addReview(`no_vehicle:${t.kind}`, r, (r.used_on_raw || '').slice(0, 60)); return; }
    stat.with_fitment++;
    if (!existingParts.has(t.oem)) {
      displays.set(t.oem, t.res.final);
      const n = cleanDescription(r.description.replace(/\*\*[^*]*\*\*/g, ' ')); // "**RESTRICTED SALES PART**"
      if (n) {
        if (!names.has(t.oem)) names.set(t.oem, new Map());
        names.get(t.oem).set(n, (names.get(t.oem).get(n) || 0) + 1);
      }
    }
    const c = rowConditions(r.description, r.used_on_raw);
    for (const [v, low] of t.targets) {
      const conf = confidence(t.oem, t.res, v, low);
      const key = `${t.oem}|${v.vehicle_id}`;
      let e = fit.get(key);
      if (!e) fit.set(key, (e = { conf, id: r.id, kind: t.kind, tags: new Set(), dom: false, cal: false, ids: [] }));
      else if (CONF_RANK[conf] < CONF_RANK[e.conf]) e.conf = conf;
      for (const tag of c.tags) e.tags.add(tag);
      e.dom ||= c.us ? c.us.dom : true;
      e.cal ||= c.us ? c.us.cal : true;
      if (e.ids.length < 3) e.ids.push(r.id);
    }
  });

  // ---- merge against existing fitment + conditions for new pairs ----
  const vById = new Map(vehicles.map((v) => [v.vehicle_id, v]));
  const merge = { agree: 0, replace_low: 0, new: 0 };
  const replaceLow = []; // keys whose 03 row is low and the books say high/medium
  const newFit = new Map(); // key -> { conf, id, kind, conditions, condition_source }
  const conflicts = [];
  for (const [key, e] of fit) {
    const had = existingFit.get(key);
    // A low 03 row (repaired number, boundary year, family row on a police
    // model) that a book lists outright is replaced by the book's row.
    if (had === 'low' && e.conf !== 'low') { merge.replace_low++; replaceLow.push(key); }
    else if (had) { merge.agree++; continue; }
    merge.new++;
    const all = new Set(e.tags);
    const mt = marketTag({ dom: e.dom, cal: e.cal });
    if (mt) all.add(mt);
    for (const [a, b] of CONFLICTS)
      if (all.has(a) && all.has(b)) { conflicts.push({ key, conflict: `${a}+${b}`, ids: e.ids.join(' ') }); all.delete(a); all.delete(b); }
    const conditions = [...all].sort();
    newFit.set(key, { conf: e.conf, id: e.id, kind: e.kind, conditions, condition_source: conditions.length ? 'catalog_text' : 'none' });
  }

  // New parts: those with at least one new fitment pair.
  const terms = seedTerms(readSeed());
  const newParts = new Map(); // oem -> { display, description_clean, slug }
  for (const key of newFit.keys()) {
    const oem = key.split('|')[0];
    if (existingParts.has(oem) || newParts.has(oem)) continue;
    const ns = names.get(oem);
    const description_clean = ns ? [...ns].sort((a, b) => b[1] - a[1])[0][0] : null;
    const m = description_clean ? matchConcept(terms, description_clean) : {};
    newParts.set(oem, { display: displays.get(oem), description_clean, slug: m.slug ?? null });
  }
  const slugOf = (oem) => existingParts.get(oem)?.slug ?? newParts.get(oem)?.slug ?? null;
  const rootOf = (oem) => existingParts.get(oem)?.chain_root ?? oem;

  // ---- report ----
  const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '-');
  const lines = [];
  lines.push(`09_service_catalog.mjs — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  lines.push(`Source: ${DIR}/rows (${books.length} books, ${books[0]?.from}-${Math.max(...books.map((b) => b.to))}; ${books.filter((b) => b.from !== b.to).length} multi-year)`);
  if (noManifest.length) lines.push(`  books without manifest years (skipped): ${noManifest.join(', ')}`);
  lines.push(`TSV lines: fitment (7 cols) ${lineKinds.fitment}; part index (5) ${lineKinds.part_index}; cross-refs (6) ${lineKinds.cross_ref}; other ${lineKinds.other}`);
  lines.push(`Fitment lines: ${stat.rows}`);
  lines.push(`  not a whole part number (headers, notes): ${stat.part_unresolved}`);
  lines.push(`  bad book year: ${stat.bad_year}`);
  lines.push(`  models column unparsed: ${stat.unparsed}`);
  lines.push(`  parsed but no matching vehicle: ${stat.no_vehicle}`);
  lines.push(`  rows producing fitment: ${stat.with_fitment} (${pct(stat.with_fitment, stat.rows)})`);
  lines.push('Models column kind (rows):');
  for (const [k, n] of Object.entries(kindRows).sort((a, b) => b[1] - a[1])) lines.push(`  ${k.padEnd(9)} ${String(n).padStart(8)}`);
  lines.push('');
  lines.push(`(part, vehicle) pairs from the books: ${fit.size}`);
  lines.push(`  already in 03 fitment (agree, left alone): ${merge.agree} (${pct(merge.agree, fit.size)})`);
  lines.push(`  03 row is low, the books list it (03 row replaced): ${merge.replace_low}`);
  lines.push(`  NEW pairs: ${merge.new} (03 fitment: ${existingFit.size})`);
  const confCount = { high: 0, medium: 0, low: 0 };
  const srcCount = { catalog_text: 0, none: 0 };
  const platCount = {};
  const newVehicles = new Set();
  for (const [key, e] of newFit) {
    confCount[e.conf]++;
    srcCount[e.condition_source]++;
    const v = vById.get(Number(key.split('|')[1]));
    platCount[v.platform] = (platCount[v.platform] || 0) + 1;
    newVehicles.add(v.vehicle_id);
  }
  for (const c of ['high', 'medium', 'low']) lines.push(`    ${c}: ${confCount[c]} (${pct(confCount[c], merge.new)})`);
  lines.push(`    with conditions: ${srcCount.catalog_text}; condition conflicts dropped: ${conflicts.length}`);
  lines.push('  NEW pairs by platform:');
  for (const [k, n] of Object.entries(platCount).sort((a, b) => b[1] - a[1])) lines.push(`    ${k.padEnd(15)} ${n}`);
  const hadFit = new Set([...existingFit.keys()].map((k) => Number(k.split('|')[1])));
  const gained = [...newVehicles].filter((id) => !hadFit.has(id)).map((id) => vById.get(id));
  lines.push(`  Vehicles with no fitment today that would get some: ${gained.length}`);
  const gainedBy = {};
  for (const v of gained) (gainedBy[`${v.platform} ${Math.floor(v.year / 10) * 10}s`] ||= []).push(`${v.model_code} ${v.year}`);
  for (const [k, xs] of Object.entries(gainedBy).sort((a, b) => b[1].length - a[1].length))
    lines.push(`    ${k.padEnd(22)} ${String(xs.length).padStart(4)}  ${xs.slice(0, 8).join(', ')}`);
  lines.push('');
  lines.push(`NEW parts (numbers not in oem_parts with new fitment): ${newParts.size}; with a name: ${[...newParts.values()].filter((p) => p.description_clean).length}; with a concept (preview): ${[...newParts.values()].filter((p) => p.slug).length}`);
  lines.push('');

  // Gate bikes: high/medium pairs and distinct chain roots per concept, now -> after.
  const byVehicle = (src, vid) => [...src].filter(([k, e]) => Number(k.split('|')[1]) === vid && (e === 'high' || e === 'medium' || e.conf === 'high' || e.conf === 'medium')).map(([k]) => k.split('|')[0]);
  lines.push('Gate bikes — fitment pairs (high+medium) and distinct parts per concept, now -> after:');
  for (const [year, code] of GATE_BIKES) {
    const v = vehicles.find((x) => x.year === year && x.model_code === code);
    if (!v) { lines.push(`  ${year} ${code}: not in vehicles`); continue; }
    const now = byVehicle(existingFit, v.vehicle_id);
    const added = byVehicle(newFit, v.vehicle_id);
    lines.push(`  ${year} ${code}: ${now.length} -> ${now.length + added.length} (+${added.length})`);
    const cells = GATE_CONCEPTS.map((slug) => {
      const a = new Set(now.filter((o) => slugOf(o) === slug).map(rootOf));
      const b = new Set([...a, ...added.filter((o) => slugOf(o) === slug).map(rootOf)]);
      return `${slug} ${a.size}${b.size > a.size ? `->${b.size}` : ''}`;
    });
    for (let k = 0; k < cells.length; k += 5) lines.push(`      ${cells.slice(k, k + 5).join(' | ')}`);
  }
  lines.push('');

  lines.push('NEW pairs per book (top 40):');
  const perBook = new Map();
  for (const e of newFit.values()) { const b = e.id.split(':')[0]; perBook.set(b, (perBook.get(b) || 0) + 1); }
  for (const [b, n] of [...perBook].sort((a, b) => b[1] - a[1]).slice(0, 40)) lines.push(`  ${b.padEnd(34)} ${n}`);
  lines.push('');
  lines.push('Model codes in the books that are not in vehicles (top 30, rows):');
  for (const [c, n] of [...missingCodes].sort((a, b) => b[1] - a[1]).slice(0, 30)) lines.push(`  ${c}: ${n}`);
  lines.push('');
  const reviewRows = [...review.values()];
  const byReason = {};
  for (const r of reviewRows) byReason[r.reason] = (byReason[r.reason] || 0) + r.rows;
  lines.push(`Review rows: ${reviewRows.reduce((n, r) => n + r.rows, 0)}`);
  for (const [k, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) lines.push(`  ${k}: ${n}`);
  lines.push('');
  lines.push('Sample (20 NEW fitment pairs, evenly spaced):');
  const keys = [...newFit.keys()].sort();
  const step = Math.max(1, Math.floor(keys.length / 20));
  for (const k of keys.filter((_, i) => i % step === 0).slice(0, 20)) {
    const e = newFit.get(k);
    const [oem, vid] = k.split('|');
    const v = vById.get(Number(vid));
    const p = existingParts.get(oem) ?? newParts.get(oem);
    const name = existingParts.has(oem) ? '' : ` NEW "${p.description_clean ?? ''}"`;
    lines.push(`  ${(p.oem_display ?? p.display).padEnd(12)} ${v.year} ${v.model_code.padEnd(9)} ${e.conf.padEnd(6)} {${e.conditions.join(',')}} ${slugOf(oem) ?? '-'}${name} ref:${e.id}`);
  }
  lines.push('');
  lines.push('Sample (20 NEW parts):');
  const np = [...newParts].sort();
  const pstep = Math.max(1, Math.floor(np.length / 20));
  for (const [, p] of np.filter((_, i) => i % pstep === 0).slice(0, 20)) lines.push(`  ${String(p.display).padEnd(14)} ${String(p.description_clean ?? '(no name)').padEnd(40)} ${p.slug ?? '-'}`);

  const ts = timestamp();
  const reportPath = path.join('reports', `09_service_catalog_${ts}.txt`);
  const reviewPath = path.join('reports', `09_service_catalog_review_${ts}.csv`);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n') + '\n');
  const cols = ['reason', 'doc', 'detail', 'rows', 'example_ids'];
  reviewRows.sort((a, b) => a.reason.localeCompare(b.reason) || b.rows - a.rows);
  fs.writeFileSync(
    reviewPath,
    [
      cols.join(','),
      ...reviewRows.map((r) => cols.map((c) => csvCell(c === 'example_ids' ? r[c].join(' ') : r[c])).join(',')),
      ...conflicts.map((c) => ['condition_conflict', '', `${c.key} ${c.conflict}`, 1, c.ids].map(csvCell).join(',')),
    ].join('\n') + '\n'
  );
  console.log(lines.join('\n'));
  console.log(`\nReport written to ${reportPath}`);
  console.log(`Review rows written to ${reviewPath}`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write to APP_DATABASE_URL.');
    return;
  }

  const client = await app.connect();
  try {
    await client.query('BEGIN');
    // catalog_ocr (11) merges against these pairs and may use service_catalog parts: re-run 11 after.
    const delFit = await client.query(`DELETE FROM fitment WHERE source IN ('service_catalog', 'catalog_ocr', 'hydra_glide', 'inferred_span')`);
    // Admin rows on service parts would block the part delete; 08 re-adds them.
    await client.query(
      `DELETE FROM fitment WHERE source = 'admin' AND oem_number IN (SELECT oem_number FROM oem_parts WHERE source = 'service_catalog')`
    );
    await client.query(
      `DELETE FROM fitment WHERE source = 'admin' AND oem_number IN (SELECT oem_number FROM oem_parts WHERE source IN ('catalog_ocr', 'hydra_glide'))`
    );
    const delParts = await client.query(`DELETE FROM oem_parts WHERE source IN ('service_catalog', 'catalog_ocr', 'hydra_glide')`);
    console.log(`Deleted ${delFit.rowCount} service_catalog / inferred_span fitment rows and ${delParts.rowCount} service_catalog parts.`);
    const delLow = await client.query(
      `DELETE FROM fitment f USING unnest($1::text[], $2::int[]) AS x(o, v)
       WHERE f.source = 'oem_catalog' AND f.confidence = 'low' AND f.oem_number = x.o AND f.vehicle_id = x.v`,
      [replaceLow.map((k) => k.split('|')[0]), replaceLow.map((k) => Number(k.split('|')[1]))]
    );
    console.log(`Replaced ${delLow.rowCount} low oem_catalog rows the books list outright.`);
    const np = [...newParts];
    const insParts = await client.query(
      `INSERT INTO oem_parts (oem_number, oem_display, description_clean, chain_root, number_source, source)
       SELECT n, d, c, n, 'extracted', 'service_catalog' FROM unnest($1::text[], $2::text[], $3::text[]) AS t(n, d, c)`,
      [np.map(([n]) => n), np.map(([, p]) => p.display), np.map(([, p]) => p.description_clean)]
    );
    const entries = [...newFit];
    let inserted = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      const chunk = entries.slice(i, i + BATCH);
      const res = await client.query(
        `INSERT INTO fitment (oem_number, vehicle_id, conditions, condition_source, source, source_ref, confidence)
         SELECT o, v, coalesce(string_to_array(nullif(c, ''), ','), '{}'), cs, 'service_catalog', 'catalog_extract:' || r, cf
         FROM unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::text[], $6::text[]) AS t(o, v, c, cs, r, cf)`,
        [
          chunk.map(([k]) => k.split('|')[0]),
          chunk.map(([k]) => Number(k.split('|')[1])),
          chunk.map(([, e]) => e.conditions.join(',')),
          chunk.map(([, e]) => e.condition_source),
          chunk.map(([, e]) => e.id),
          chunk.map(([, e]) => e.conf),
        ]
      );
      inserted += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`Inserted ${insParts.rowCount} parts and ${inserted} fitment rows (source = 'service_catalog').`);
    console.log('Next: 11_catalog_books --apply, 05 --apply, 06 --apply, 07 --max-hole 3 --apply, 08 --apply.');
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
  .finally(() => {
    source.end();
    app.end();
  });
