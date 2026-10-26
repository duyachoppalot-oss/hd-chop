// scripts/etl/05_supersession.mjs
//
// Loads oem_supersession from catalog notes and sets oem_parts.chain_root
// (ETL_PLAN step 05).
//
// - The 283 source oem_supersession rows are NOT loaded: all `inferred` letter
//   bumps, which the domain rule treats as parallel options.
// - Notes in hd_oem_catalog_reference descriptions:
//     "(use 31553-90A)"          line number -> 31553-90A
//     "(replaces 42303-00 & 42305-00)"  each listed number -> line number
//   "use w/ …" and "also order …" are not supersession. The line number
//   resolves exactly as in 02 (lib/parts.mjs).
// - The same notes in the H-D service-portal catalogs (lib/servicecatalog.mjs,
//   descriptions like "BRACKET, engine mounting (replaces 16216-91)"), added
//   2026-10-24. Their part numbers are whole, so no resolving.
// - hydra-glide.net OEM lists (DATA_RIGHTS, approved 2026-10-25; CSV at
//   HYDRA_CSV): each row's old (pre-renumbering) number -> its new number, and
//   number -> replaced_by. Same checks as the notes.
// - oem_fitment notes (qty_note / description) only corroborate: its rows are
//   misaligned (DISCOVERY.md), so pairs seen only there go to review.
// - A pair goes to review if both part names are known and their head words
//   differ: mostly a piece now sold only in an assembly (idler gear -> complete
//   starter); chaining those would merge different parts' spans. A newer number
//   with an older -YY suffix is allowed (HD consolidates onto older numbers:
//   starter -> starter, cover -> cover) and only counted.
// - chain_root: follow from -> to to the end. A number replaced by two
//   different numbers, or a cycle, keeps itself as root and goes to review.
//   Roots must be in oem_parts (else the chain stops at the last known number).
//
// --apply replaces source = 'catalog_use_note' rows and rewrites chain_root for
// every part. Refresh fitment_spans afterwards (08).
//
// Usage:
//   node scripts/etl/05_supersession.mjs            (dry-run, prints + writes report only)
//   node scripts/etl/05_supersession.mjs --apply    (writes to APP_DATABASE_URL)

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { makeResolver, classify, normalize, suffixYear } from './lib/parts.mjs';
import { readBooks, available as serviceCatalogAvailable } from './lib/servicecatalog.mjs';
import os from 'node:os';

const HYDRA_CSV = process.env.HYDRA_CSV || path.join(os.homedir(), 'Developer/catalog-extract/hydra/hydra_glide_oem_parts.csv');

import { readCsv } from './lib/csv.mjs';

const APPLY = process.argv.includes('--apply');

const source = new pg.Pool({ connectionString: process.env.SOURCE_DATABASE_URL });
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

const NUM = String.raw`\d{4,5}-\d{2}[A-Z]{0,3}|\d{8}[A-Z]{0,4}`;
const USE = new RegExp(String.raw`\buse\s+(?!w\/|with\b)((?:${NUM})(?:\s*(?:&|,|or)\s*(?:${NUM}))*)`, 'gi');
const REPLACES = new RegExp(String.raw`\breplaces\s+((?:${NUM})(?:\s*(?:&|,|and)\s*(?:${NUM}))*)`, 'gi');
const listNumbers = (s) => [...s.toUpperCase().matchAll(new RegExp(NUM, 'g'))].map((m) => m[0]);

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Pairs [from, to] (normalized) from one line's text, given the line's own number.
function notePairs(text, lineOem) {
  const pairs = [];
  if (!text) return pairs;
  for (const m of text.matchAll(USE)) for (const n of listNumbers(m[1])) pairs.push([lineOem, n]);
  for (const m of text.matchAll(REPLACES)) for (const n of listNumbers(m[1])) pairs.push([n, lineOem]);
  return pairs.filter(([a, b]) => a && b && a !== b);
}

async function main() {
  const rows = (await source.query(`SELECT id, part_number, description, year_start, year_end FROM hd_oem_catalog_reference ORDER BY id`)).rows;
  const fitmentSrc = (
    await source.query(`
      SELECT upper(trim(oem_part_no)) AS display, catalog_year_start AS year_start, catalog_year_end AS year_end,
             description, qty_note
      FROM oem_fitment WHERE oem_part_no IS NOT NULL
        AND (coalesce(qty_note, '') ~* '(use|replaces) +[0-9]' OR coalesce(description, '') ~* '(use|replaces) +[0-9]')
    `)
  ).rows;
  const allFitment = (
    await source.query(`
      SELECT DISTINCT upper(trim(oem_part_no)) AS display, catalog_year_start AS year_start, catalog_year_end AS year_end
      FROM oem_fitment WHERE oem_part_no IS NOT NULL
    `)
  ).rows;
  const parts = new Map((await app.query(`SELECT oem_number, oem_display, description_clean FROM oem_parts`)).rows.map((r) => [r.oem_number, r]));
  const { resolve } = makeResolver(rows, allFitment);

  // display form for a normalized number, for suffix years and reports
  const displayOf = (n) => parts.get(n)?.oem_display ?? n;

  // ---- collect pairs ----
  const pairs = new Map(); // `${from}|${to}` -> { from, to, ref: Set(ids), fit: 0 }
  const review = [];
  let refLines = 0;
  let unresolvedLines = 0;
  for (const r of rows) {
    if (!/\b(use|replaces)\s+\d/i.test(r.description || '')) continue;
    refLines++;
    const res = resolve(r);
    if (!res.final) { unresolvedLines++; review.push({ reason: 'line_number_unresolved', from: r.part_number, to: '', ids: r.id, note: (r.description || '').slice(0, 80) }); continue; }
    for (const [a, b] of notePairs(r.description, res.final)) {
      const from = normalize(classify(a).display);
      const to = normalize(classify(b).display);
      if (from === to) continue;
      const k = `${from}|${to}`;
      const e = pairs.get(k) ?? { from, to, fromDisplay: classify(a).display, toDisplay: classify(b).display, ref: new Set(), fit: 0 };
      e.ref.add(r.id);
      pairs.set(k, e);
    }
  }
  // Service-portal catalogs: same notes, whole part numbers.
  let svcLines = 0, svcNew = 0;
  if (serviceCatalogAvailable())
    for (const r of readBooks().rows) {
      if (!/\b(use|replaces)\s+\d/i.test(r.description || '')) continue;
      const line = classify(r.part_number);
      if (line.cls !== 'std' && line.cls !== 'modern') continue;
      svcLines++;
      for (const [a, b] of notePairs(r.description, line.display)) {
        const from = normalize(classify(a).display);
        const to = normalize(classify(b).display);
        if (from === to) continue;
        const k = `${from}|${to}`;
        if (!pairs.has(k)) { svcNew++; pairs.set(k, { from, to, fromDisplay: classify(a).display, toDisplay: classify(b).display, ref: new Set(), fit: 0 }); }
        pairs.get(k).ref.add(`catalog_extract:${r.id}`);
      }
    }

  // hydra-glide.net: old number -> new number, number -> replaced_by.
  let hydraPairs = 0, hydraNew = 0;
  if (fs.existsSync(HYDRA_CSV))
    for (const r of readCsv(HYDRA_CSV)) {
      const links = [];
      if (r.old_pn && r.oem_pn) links.push([r.old_pn, r.oem_pn]);
      if (r.replaced_by) links.push([r.oem_pn || r.old_pn, r.replaced_by]);
      // Pre-1972 numbers have a short base ("682-49", "2472-41B": classify 'short_base');
      // the 5-digit post-1972 number replaces it. The export's two columns don't always
      // keep that order ("36150-31" / "2366-31"), so a short_base side is always the older one.
      const OK = ['std', 'modern', 'hardware', 'short_base'];
      for (let [a, b] of links) {
        let ca = classify(a.trim()), cb = classify(b.trim());
        if (!OK.includes(ca.cls) || !OK.includes(cb.cls)) continue;
        if (cb.cls === 'short_base' && ca.cls === 'std') [ca, cb] = [cb, ca];
        const from = normalize(ca.display), to = normalize(cb.display);
        if (from === to) continue;
        hydraPairs++;
        const k = `${from}|${to}`;
        if (!pairs.has(k)) { hydraNew++; pairs.set(k, { from, to, fromDisplay: ca.display, toDisplay: cb.display, ref: new Set(), fit: 0 }); }
        pairs.get(k).ref.add(`hydra_glide:${r.source_row}`);
      }
    }

  const fitOnly = new Map();
  for (const r of fitmentSrc) {
    const line = classify(r.display);
    if (line.cls !== 'std' && line.cls !== 'modern') continue;
    for (const text of [r.qty_note, r.description])
      for (const [a, b] of notePairs(text, line.display)) {
        const k = `${normalize(classify(a).display)}|${normalize(classify(b).display)}`;
        if (pairs.has(k)) pairs.get(k).fit++;
        else fitOnly.set(k, (fitOnly.get(k) || 0) + 1);
      }
  }
  for (const [k, n] of fitOnly) {
    const [from, to] = k.split('|');
    review.push({ reason: 'oem_fitment_only', from, to, ids: `${n} oem_fitment rows`, note: '' });
  }

  // ---- validate pairs ----
  const accepted = [];
  let olderTarget = 0;
  for (const e of pairs.values()) {
    const yFrom = suffixYear(e.fromDisplay);
    const yTo = suffixYear(e.toDisplay);
    const nFrom = parts.get(e.from)?.description_clean;
    const nTo = parts.get(e.to)?.description_clean;
    const head = (d) => d.toLowerCase().split(/[\s,]/)[0];
    const hFrom = nFrom ? head(nFrom) : null;
    const hTo = nTo ? head(nTo) : null;
    const ids = [...e.ref].slice(0, 3).join(' ');
    if (hFrom && hTo && hFrom !== hTo) { review.push({ reason: 'name_mismatch', from: e.fromDisplay, to: e.toDisplay, ids, note: `${nFrom} -> ${nTo}` }); continue; }
    if (yFrom && yTo && yTo < yFrom) olderTarget++;
    accepted.push(e);
  }

  // ---- chains ----
  const next = new Map(); // from -> Set(to)
  for (const e of accepted) {
    if (!next.has(e.from)) next.set(e.from, new Set());
    next.get(e.from).add(e.to);
  }
  const forks = [...next].filter(([, s]) => s.size > 1);
  for (const [from, s] of forks) review.push({ reason: 'replaced_by_several', from: displayOf(from), to: [...s].map(displayOf).join(' '), ids: '', note: '' });

  const root = new Map();
  const cycles = new Set();
  function rootOf(n) {
    if (root.has(n)) return root.get(n);
    const seen = [n];
    let cur = n;
    for (;;) {
      const s = next.get(cur);
      if (!s || s.size !== 1) break;
      const nxt = [...s][0];
      if (!parts.has(nxt)) break; // chain stops at the last number we have
      if (seen.includes(nxt)) { for (const x of seen) cycles.add(x); cur = n; break; }
      seen.push(nxt);
      cur = nxt;
      if (root.has(cur)) { cur = root.get(cur); break; }
    }
    for (const x of seen) if (!root.has(x)) root.set(x, cycles.has(x) ? x : cur);
    return root.get(n);
  }
  let changed = 0;
  const chainLen = {};
  for (const n of parts.keys()) if (rootOf(n) !== n) changed++;
  for (const c of cycles) review.push({ reason: 'cycle', from: displayOf(c), to: [...(next.get(c) || [])].map(displayOf).join(' '), ids: '', note: '' });
  const members = {};
  for (const [n, r] of root) if (parts.has(n)) (members[r] ||= []).push(n);
  for (const ms of Object.values(members)) if (ms.length > 1) chainLen[ms.length] = (chainLen[ms.length] || 0) + 1;
  const toMissing = accepted.filter((e) => !parts.has(e.to)).length;
  const fromMissing = accepted.filter((e) => !parts.has(e.from)).length;

  // ---- report ----
  const byReason = {};
  for (const r of review) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
  const lines = [];
  lines.push(`05_supersession.mjs — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  lines.push(`Source oem_supersession rows skipped (all inferred letter bumps): 283`);
  lines.push(`Reference lines with use/replaces notes: ${refLines} (line number unresolved: ${unresolvedLines})`);
  lines.push(`Service-portal catalog lines with use/replaces notes: ${svcLines}; pairs only they give: ${svcNew}`);
  lines.push(`hydra-glide.net links (old -> new number, replaced_by): ${hydraPairs}; pairs only they give: ${hydraNew}`);
  lines.push(`Distinct pairs from reference: ${pairs.size}; also in oem_fitment notes: ${[...pairs.values()].filter((e) => e.fit).length}`);
  lines.push(`Pairs only in oem_fitment (review, not loaded): ${fitOnly.size}`);
  lines.push(`Accepted pairs: ${accepted.length} (newer number has an older -YY suffix: ${olderTarget})`);
  lines.push(`  replaced number not in oem_parts: ${fromMissing}; newer number not in oem_parts: ${toMissing}`);
  lines.push(`Numbers replaced by several numbers (no chain): ${forks.length}; numbers in cycles: ${cycles.size}`);
  lines.push(`Parts whose chain_root changes: ${changed} of ${parts.size}`);
  lines.push(`Chains by size (parts in chain: chains): ${Object.entries(chainLen).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  lines.push('');
  lines.push(`Review: ${review.length}`);
  for (const [k, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) lines.push(`  ${k}: ${n}`);
  lines.push('');
  lines.push('Sample accepted pairs (20, evenly spaced): from -> to  (names)');
  const step = Math.max(1, Math.floor(accepted.length / 20));
  for (const e of accepted.filter((_, i) => i % step === 0).slice(0, 20))
    lines.push(`  ${e.fromDisplay.padEnd(12)} -> ${e.toDisplay.padEnd(12)} ${(parts.get(e.from)?.description_clean ?? '?').slice(0, 26).padEnd(27)} -> ${(parts.get(e.to)?.description_clean ?? '(not in oem_parts)').slice(0, 26)}  ${e.fit ? '[also oem_fitment]' : ''}`);
  lines.push('');
  lines.push('Longest chains (5):');
  for (const [r, ms] of Object.entries(members).sort((a, b) => b[1].length - a[1].length).slice(0, 5))
    lines.push(`  root ${displayOf(r)} (${parts.get(r)?.description_clean ?? ''}): ${ms.map(displayOf).sort().join(', ')}`);

  const ts = timestamp();
  const reportPath = path.join('reports', `05_supersession_${ts}.txt`);
  const reviewPath = path.join('reports', `05_supersession_review_${ts}.csv`);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n') + '\n');
  const cols = ['reason', 'from', 'to', 'ids', 'note'];
  fs.writeFileSync(reviewPath, [cols.join(','), ...review.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');
  // Accepted pairs with the sources that give them (scripts/dev/source_removal.mjs).
  // Ref ids: bare = hd_oem_catalog_reference (oem_catalog), catalog_extract: = service_catalog, hydra_glide:.
  const srcOf = (id) => (String(id).startsWith('catalog_extract:') ? 'service_catalog' : String(id).startsWith('hydra_glide:') ? 'hydra_glide' : 'oem_catalog');
  const pairsPath = path.join('reports', `05_supersession_pairs_${ts}.csv`);
  fs.writeFileSync(
    pairsPath,
    ['from,to,sources', ...accepted.map((e) => [e.from, e.to, [...new Set([...e.ref].map(srcOf))].sort().join(' ')].map(csvCell).join(','))].join('\n') + '\n'
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
    await client.query(`DELETE FROM oem_supersession WHERE source = 'catalog_use_note'`);
    await client.query(
      `INSERT INTO oem_supersession (from_oem, to_oem, source)
       SELECT f, t, 'catalog_use_note' FROM unnest($1::text[], $2::text[]) AS x(f, t) ON CONFLICT DO NOTHING`,
      [accepted.map((e) => e.from), accepted.map((e) => e.to)]
    );
    const keys = [...parts.keys()];
    const res = await client.query(
      `UPDATE oem_parts p SET chain_root = x.r FROM unnest($1::text[], $2::text[]) AS x(n, r)
       WHERE p.oem_number = x.n AND p.chain_root IS DISTINCT FROM x.r`,
      [keys, keys.map((n) => root.get(n) ?? n)]
    );
    await client.query('COMMIT');
    console.log(`Inserted ${accepted.length} supersession pairs; chain_root changed on ${res.rowCount} parts.`);
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
