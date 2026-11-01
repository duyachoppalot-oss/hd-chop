#!/usr/bin/env node
// NHTSA safety recalls for every Harley-Davidson model-year (public US-government data,
// api.nhtsa.gov). NHTSA names H-D models by their model code (FLHX, XL883N), so recalls map
// straight onto vehicles (year, model_code).
//
//   node scripts/etl/20_nhtsa_recalls.mjs            dry run: fetch (cached), map, report
//   node scripts/etl/20_nhtsa_recalls.mjs --refresh  re-fetch instead of using the cache
//   (--apply: not built yet; needs the recall tables and Laken's OK)
//
// Cache: ~/Developer/catalog-extract/nhtsa/<year>.json. Report: reports/20_nhtsa_recalls_<ts>.txt
// plus a CSV of every (campaign, year, model) pair.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import 'dotenv/config';
import { resolveModelText } from './lib/vendorterms.mjs';

const API = 'https://api.nhtsa.gov';
const CACHE = path.join(os.homedir(), 'Developer/catalog-extract/nhtsa');
const refresh = process.argv.includes('--refresh');
fs.mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);

async function get(url) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.ok) return await r.json();
      if (r.status === 400 || r.status === 404) return { results: [] };
    } catch { /* retry */ }
    await sleep(2000 * (t + 1));
  }
  throw new Error(`failed: ${url}`);
}

const pool = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const vehicles = (await pool.query('SELECT vehicle_id, year, model_code, model_name, platform FROM vehicles')).rows;
const vkey = new Map(vehicles.map((v) => [`${v.year}|${v.model_code}`, v]));
const years = [...new Set(vehicles.map((v) => v.year))].filter((y) => y >= 1966).sort();

const FLAT = path.join(CACHE, 'flat/hd_only.tsv');
const useFlat = fs.existsSync(FLAT) && !process.argv.includes('--api');
const pairs = [];
if (useFlat) {
  // NHTSA flat file (FLAT_RCL_PRE/POST_2010, Harley-Davidson makes only): tab-separated,
  // 2 CAMPNO 4 MODELTXT 5 YEARTXT 6 MFGCAMPNO 7 COMPNAME 11 RCLTYPECD 12 POTAFF 16 RCDATE 20 DESC 21 CONSEQUENCE 22 REMEDY
  for (const line of fs.readFileSync(FLAT, 'utf8').split('\n')) {
    const f = line.split('\t');
    if (f.length < 22 || f[10] !== 'V' || !/^(19|20)\d\d$/.test(f[4])) continue;
    const d = f[15];
    pairs.push({ year: Number(f[4]), model: f[3], r: { NHTSACampaignNumber: f[1], ReportReceivedDate: d ? `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}` : '', Component: f[6], Summary: f[19], Remedy: f[21], hd: f[5], affected: Number(f[11]) || null } });
  }
}
for (const year of useFlat ? [] : years) {
  const file = path.join(CACHE, `${year}.json`);
  let data;
  if (!refresh && fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    const models = (await get(`${API}/products/vehicle/models?modelYear=${year}&make=harley-davidson&issueType=r`)).results ?? [];
    data = {};
    for (const m of models) {
      data[m.model] = (await get(`${API}/recalls/recallsByVehicle?make=HARLEY-DAVIDSON&model=${encodeURIComponent(m.model)}&modelYear=${year}`)).results ?? [];
      await sleep(250);
    }
    fs.writeFileSync(file, JSON.stringify(data));
    console.error(`${year}: ${Object.keys(data).length} models`);
  }
  for (const [model, recalls] of Object.entries(data)) for (const r of recalls) pairs.push({ year, model, r });
}
await pool.end();

// NHTSA model names are codes, sometimes with an engine suffix (FLHX103) or spaces
const norm = (m) => m.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
const strip = (c) => c.replace(/(96|103|107|110|114|117|131)$/, '');
// NHTSA spellings of our codes: displacement appended (FLH1200, FLH80, XLH1000, FX1200),
// EFI "I" appended (FLHPI, FLHTCUI: our vehicles carry EFI in fuel_system, not the code)
const variants = (c) => [c.replace(/^([A-Z]+?)(\d)-CVO$/, '$1SE$2'), c, strip(c), c.replace(/(1200|1000|1340|80|74)$/, ''), c.replace(/I$/, ''), c.replace(/-?(CVO|SHRINE)$/, '')];
const one = (year, c) => variants(c).map((x) => vkey.get(`${year}|${x}`)).find(Boolean) ?? null;
// shared resolver (codes, families like FLH / XL / 1200, year-bounded model names)
const matchText = (year, model) => {
  const v = one(year, norm(model));
  return v ? [v] : resolveModelText(model, year, vehicles).matches;
};
// text the resolver can't place: the codes the defect summary names in parentheses for that year
const fromSummary = (year, summary) => [...new Map([...(summary ?? '').matchAll(/\(([A-Z]{2,}[A-Z0-9-]*)\)/g)]
  .map((m) => one(year, m[1])).filter(Boolean).map((v) => [v.vehicle_id, v])).values()];

const campaigns = new Map();
const unmatched = new Map();
let matched = 0, bySummary = 0;
const rows = [];
for (const p of pairs) {
  const c = p.r.NHTSACampaignNumber;
  if (!campaigns.has(c)) campaigns.set(c, { c, date: p.r.ReportReceivedDate, component: p.r.Component, hd: p.r.hd || (/recall is (\w+)/i.exec(p.r.Remedy ?? '')?.[1] ?? ''), summary: p.r.Summary ?? '', bikes: new Set() });
  let vs = matchText(p.year, p.model), how = 'model';
  if (!vs.length) { vs = fromSummary(p.year, p.r.Summary); how = 'summary'; }
  if (vs.length) { matched++; how === 'summary' && bySummary++; vs.forEach((v) => campaigns.get(c).bikes.add(v.vehicle_id)); }
  else unmatched.set(`${p.year} ${p.model}`, (unmatched.get(`${p.year} ${p.model}`) ?? 0) + 1);
  for (const v of vs.length ? vs : [null]) rows.push([c, p.year, p.model, v?.model_code ?? '', v?.platform ?? '', vs.length ? how : '', p.r.Component, p.r.ReportReceivedDate]);
}

const L = [];
L.push(`20_nhtsa_recalls (dry run, nothing written) ${ts}`, `source ${useFlat ? FLAT : 'api.nhtsa.gov recallsByVehicle'}`, '');
L.push(`model-years checked: ${years.length} (${years[0]}-${years.at(-1)})`);
L.push(`recall campaigns: ${campaigns.size}; (campaign, year, model) pairs: ${pairs.length}; mapped to our vehicles: ${matched} (${bySummary} via codes named in the summary); not mapped: ${pairs.length - matched}`);
const perYear = new Map();
for (const p of pairs) perYear.set(p.year, (perYear.get(p.year) ?? new Set()).add(p.r.NHTSACampaignNumber));
L.push('', 'Campaigns per model year:', '  ' + [...perYear].map(([y, s]) => `${y}:${s.size}`).join('  '));
const comp = new Map();
for (const c of campaigns.values()) { const k = c.component.split(':')[0]; comp.set(k, (comp.get(k) ?? 0) + 1); }
L.push('', 'Campaigns by component:', ...[...comp].sort((a, z) => z[1] - a[1]).map(([k, n]) => `  ${String(n).padStart(4)} ${k}`));
const codeLike = (k) => /^\d{4} [A-Z]{2,}[A-Z0-9-]*$/.test(k);
const um = [...unmatched.keys()].sort();
L.push('', `NHTSA models not matched to a vehicle (${unmatched.size}):`,
  `  model codes we have no vehicle for that year (${um.filter(codeLike).length}): ` + um.filter(codeLike).join(', '),
  `  names / families / other makes (${um.filter((k) => !codeLike(k)).length}): ` + um.filter((k) => !codeLike(k)).join(', '));
L.push('', 'Sample campaigns (20):');
for (const c of [...campaigns.values()].slice(0, 20)) L.push(`  ${c.c} ${c.date} ${c.component} | H-D #${c.hd || '?'} | ${c.bikes.size} of our bikes | ${c.summary.slice(0, 140)}`);
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(`reports/20_nhtsa_recalls_${ts}.txt`, L.join('\n') + '\n');
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(`reports/20_nhtsa_recall_pairs_${ts}.csv`, ['campaign,year,nhtsa_model,model_code,platform,matched_by,component,report_date', ...rows.map((r) => r.map(q).join(','))].join('\n') + '\n');
console.log(`→ reports/20_nhtsa_recalls_${ts}.txt. ${campaigns.size} campaigns, ${pairs.length} pairs, ${matched} mapped.`);
