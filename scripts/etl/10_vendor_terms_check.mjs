// Read-only check of lib/vendorterms.mjs against real vendor text.
// Reads vtwin_scrape_data.fitment_raw (source DB) and vehicles (hdchop); writes nothing to either.
// Report: reports/10_vendor_terms_<ts>.txt — counts by kind/reason, review tokens, 20 sample expansions.
//   node scripts/etl/10_vendor_terms_check.mjs
import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import { resolveSegment, splitFitmentRaw } from './lib/vendorterms.mjs';

const src = new pg.Pool({ connectionString: process.env.SOURCE_DATABASE_URL });
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

const vehicles = (await app.query('select vehicle_id, year, model_code, platform, engine from vehicles')).rows;
const rows = (await src.query(`select sku, oem_no, fitment_raw from vtwin_scrape_data where fitment_raw is not null`)).rows;

const byKind = {}, byReason = {}, reviewTok = {}, unparsed = {}, samples = [];
let segs = 0, pre85 = 0, pre85Matched = 0;
for (const r of rows) {
  for (const s of splitFitmentRaw(r.fitment_raw)) {
    segs++;
    if (s.raw) { unparsed[s.tok.slice(0, 50)] = (unparsed[s.tok.slice(0, 50)] || 0) + 1; continue; }
    const res = resolveSegment(s.tok, s.y0, s.y1, vehicles);
    byKind[res.kind] = (byKind[res.kind] || 0) + 1;
    const rk = `${res.kind} | ${res.reason}`;
    byReason[rk] = (byReason[rk] || 0) + 1;
    if (res.kind === 'review') { const k = `${s.tok} (${res.reason})`; reviewTok[k] = (reviewTok[k] || 0) + 1; }
    if (s.y0 < 1985) { pre85++; if (res.matches.length) pre85Matched++; }
    if (res.matches.length && s.y0 < 1985 && samples.length < 400) samples.push({ seg: `${s.tok} ${s.y0}-${s.y1}`, oem: r.oem_no, res });
  }
}

const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `  ${String(v).padStart(6)}  ${k}`).join('\n');
const summarize = (ms) => {
  const g = {};
  for (const v of ms) (g[v.model_code] ??= []).push(v.year);
  return Object.entries(g).map(([c, ys]) => `${c} ${Math.min(...ys)}–${Math.max(...ys)}`).join(', ');
};
const pick = samples.sort(() => Math.random() - 0.5).slice(0, 20);
const out = [
  `10_vendor_terms_check  ${new Date().toISOString()}  (read-only)`,
  `vtwin rows ${rows.length}, segments ${segs}; pre-1985 segments ${pre85}, matched to existing vehicles ${pre85Matched}`,
  `vehicles in hdchop ${vehicles.length}`,
  '', 'By kind:', top(byKind, 10),
  '', 'By kind | reason:', top(byReason, 40),
  '', 'Review tokens (top 40):', top(reviewTok, 40),
  '', 'Unparsed segments (top 20):', top(unparsed, 20),
  '', '20 sample pre-1985 expansions:',
  ...pick.map((s) => `  ${s.seg.padEnd(22)} oem ${String(s.oem).padEnd(12)} ${s.res.kind}/${s.res.reason} -> ${summarize(s.res.matches)}`),
];
fs.mkdirSync('reports', { recursive: true });
const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
const file = `reports/10_vendor_terms_${ts}.txt`;
fs.writeFileSync(file, out.join('\n') + '\n');
console.log(out.slice(0, 6).join('\n') + `\n→ ${file}`);
await src.end(); await app.end();
