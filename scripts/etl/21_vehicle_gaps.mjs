#!/usr/bin/env node
// Dry run: model-years NHTSA's recall file names that our vehicles table lacks, checked
// against H-D's own owner's manuals for that year before anything is added.
//
//   node scripts/etl/20_nhtsa_recalls.mjs      (writes reports/20_nhtsa_recall_pairs_<ts>.csv)
//   node scripts/etl/21_vehicle_gaps.mjs       (reads the newest pairs CSV)
//
// For each unmatched (year, NHTSA model) that looks like a model code:
//   - candidate codes: the code as NHTSA spells it, without a displacement suffix
//     (FLHS1200 -> FLHS), without the EFI "I" (FLTRI -> FLTR), without -CVO;
//   - picker: whether the source picker had the row and 01 rejected it (01 review CSV);
//   - manuals: H-D owner's manuals dated that year (title year; "& later" / sidecar /
//     sound-system manuals skipped) whose text prints the code as a word, with a count.
// Verdict: 'confirmed' = an owner's manual of that year prints the code; 'nhtsa_only' =
// no H-D document found (left out: NHTSA mislabels exist, e.g. FXD 1986-90).
// Writes reports/21_vehicle_gaps_<ts>.txt + .csv. Nothing is written to the DB; a confirmed
// list becomes evidence for 01 (like its DOC_YEARS) only after Laken reviews it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import 'dotenv/config';
import { readCsv } from './lib/csv.mjs';

const MAN = path.join(os.homedir(), 'Developer/catalog-extract/manuals');
const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
const newest = (re) => fs.readdirSync('reports').filter((f) => re.test(f)).sort().at(-1);

const pairsFile = newest(/^20_nhtsa_recall_pairs_.*\.csv$/);
const gaps = new Map(); // "year|model" -> campaigns
for (const r of readCsv(path.join('reports', pairsFile))) {
  if (r.model_code) continue;
  const year = Number(r.year), model = r.nhtsa_model.toUpperCase();
  if (!/^[A-Z]{2,}[A-Z0-9-]*$/.test(model)) continue;
  const k = `${year}|${model}`;
  (gaps.get(k) ?? gaps.set(k, new Set()).get(k)).add(r.campaign);
}

// 01's rejected picker rows
const reviewFile = newest(/^01_vehicles_review_.*\.csv$/);
const picker = new Map();
if (reviewFile) {
  for (const r of readCsv(path.join('reports', reviewFile))) picker.set(`${r.year}|${r.code}`, { reason: r.reason, name: r.model_name });
}

// owner's manuals by year (text built from pdftotext / OCR into manuals/text)
const index = JSON.parse(fs.readFileSync(path.join(MAN, 'index.json'), 'utf8'));
const byYear = new Map();
for (const m of Object.values(index)) {
  const y = Number(/^(19|20)\d\d/.exec(m.title)?.[0]);
  if (!y || /later|sidecar|sound system|boom|evse|eg\/fr|\(eg/i.test(m.title)) continue;
  const f = path.join(MAN, 'text', m.file.replace(/\.pdf$/, '.txt'));
  if (fs.existsSync(f)) (byYear.get(y) ?? byYear.set(y, []).get(y)).push({ title: m.title, text: fs.readFileSync(f, 'utf8') });
}

const pool = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const have = new Set((await pool.query('SELECT year, model_code FROM vehicles')).rows.map((v) => `${v.year}|${v.model_code}`));
const anyYear = new Map((await pool.query('SELECT model_code, min(year) y0, max(year) y1, min(model_name) n, min(platform) p FROM vehicles GROUP BY 1')).rows.map((r) => [r.model_code, r]));
await pool.end();

// family words and other makes' names, not model codes
const GENERIC = /^(FL|FX|XL|FXD|DYNA|TOURING|TRIKE|SIDECAR|SERVICAR|MT500|RLE|TLE|SS250|SX175|SX250|SXT125|Z90)$/;
// NHTSA's CVO spelling: FLHTCU4-CVO = FLHTCUSE4, FLTR3-CVO = FLTRSE3
const cvo = (m) => m.replace(/^([A-Z]+?)(\d)-CVO$/, '$1SE$2');
const out = [];
for (const [k, camps] of gaps) {
  const [ys, model] = k.split('|'); const year = Number(ys);
  // bare XLH after 1985 = the XLH 883 / 1100 / 1200 codes we already carry (manuals print "XLH 883")
  if (GENERIC.test(model) || (model === 'XLH' && year >= 1986)) continue;
  const cands = [...new Set([cvo(model), model, model.replace(/(1200|1000|1340|80|74)$/, ''), model.replace(/I$/, ''), model.replace(/-?(CVO|SHRINE)$/, ''), model.replace(/(1200|1000|80)$/, '').replace(/I$/, '')])].filter((c) => c.length >= 2);
  let best = null;
  for (const c of cands) {
    if (have.has(`${year}|${c}`)) continue;
    const re = new RegExp(`(^|[^A-Z0-9-])${c.replace(/-/g, '\\-')}([^A-Z0-9-]|$)`, 'g');
    const hits = (byYear.get(year) ?? []).map((m) => ({ title: m.title, n: (m.text.match(re) ?? []).length })).filter((x) => x.n);
    const score = hits.reduce((s, x) => s + x.n, 0);
    if (!best || score > best.score || (score === best.score && picker.has(`${year}|${c}`) && !picker.has(`${year}|${best.code}`))) best = { code: c, hits, score };
  }
  if (!best) continue;
  const p = picker.get(`${year}|${best.code}`);
  const known = anyYear.get(best.code);
  out.push({
    year, nhtsa: model, code: best.code, campaigns: [...camps], manuals: best.hits, mentions: best.score,
    picker: p ? `${p.reason} (${p.name})` : '', other_years: known ? `${known.y0}-${known.y1} ${known.n ?? ''} ${known.p}` : '',
    manuals_that_year: (byYear.get(year) ?? []).length,
    verdict: best.score >= 3 ? 'confirmed' : best.score ? 'weak' : 'nhtsa_only',
  });
}
// one row per (year, code): NHTSA spells some codes two ways (FLHPE, FLHPEI)
const seen = new Map();
for (const o of out.splice(0)) {
  const k = `${o.year}|${o.code}`, p = seen.get(k);
  if (!p) { seen.set(k, o); continue; }
  p.campaigns = [...new Set([...p.campaigns, ...o.campaigns])]; p.nhtsa += ` / ${o.nhtsa}`;
}
out.push(...seen.values());
out.sort((a, z) => a.code.localeCompare(z.code) || a.year - z.year);

const L = [`21_vehicle_gaps (dry run, nothing written) ${ts}`, `pairs ${pairsFile}; 01 review ${reviewFile ?? '-'}; manuals ${MAN}`, ''];
const conf = out.filter((o) => o.verdict === 'confirmed');
L.push(`NHTSA (year, code) we lack, family words and non-big-twin makes left out: ${out.length}; confirmed (3+ mentions in that year's owner's manuals): ${conf.length}; weak: ${out.filter((o) => o.verdict === 'weak').length}; NHTSA only: ${out.filter((o) => o.verdict === 'nhtsa_only').length}`);
L.push(`  of the confirmed, the source picker had the row (01 rejected it for evidence): ${conf.filter((o) => o.picker).length}`, '');
L.push('Confirmed (code year: mentions in that year\'s manuals | picker | our other years):');
for (const o of conf) L.push(`  ${o.code.padEnd(9)} ${o.year}  ${String(o.mentions).padStart(3)}x in ${o.manuals.map((m) => m.title.replace(/HARLEY-DAVIDSON® ?|OWNER'S MANUAL:? ?/gi, '')).join('; ').slice(0, 90)} | ${o.picker || 'not in picker'} | ${o.other_years || 'new code'}`);
L.push('', 'Weak (1-2 mentions in that year\'s manuals; check by hand):');
for (const o of out.filter((o) => o.verdict === 'weak')) L.push(`  ${o.code.padEnd(9)} ${o.year}  ${o.mentions}x in ${o.manuals.map((m) => m.title).join('; ').slice(0, 80)} | ${o.picker || 'not in picker'} | ${o.other_years || 'new code'}`);
L.push('', 'NHTSA only (no H-D manual of that year prints the code):');
for (const o of out.filter((o) => o.verdict === 'nhtsa_only')) L.push(`  ${o.code.padEnd(9)} ${o.year}  (NHTSA ${o.nhtsa}, ${o.manuals_that_year} manuals that year) | ${o.picker || 'not in picker'} | ${o.other_years || 'new code'}`);
fs.writeFileSync(`reports/21_vehicle_gaps_${ts}.txt`, L.join('\n') + '\n');
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(`reports/21_vehicle_gaps_${ts}.csv`, ['verdict,year,code,nhtsa_model,mentions,manuals,picker,other_years,campaigns',
  ...out.map((o) => [o.verdict, o.year, o.code, o.nhtsa, o.mentions, o.manuals.map((m) => `${m.title} (${m.n})`).join('; '), o.picker, o.other_years, o.campaigns.join(' ')].map(q).join(','))].join('\n') + '\n');
console.log(`→ reports/21_vehicle_gaps_${ts}.txt. ${out.length} gaps, ${conf.length} confirmed.`);
