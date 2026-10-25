// scripts/etl/14_hydra_glide.mjs
//
// Fitment and part numbers from the hydra-glide.net OEM parts lists Laken scraped
// (DATA_RIGHTS row approved 2026-10-25; CSV at HYDRA_CSV). Third-party source:
// it only adds (part, bike) pairs no H-D source has, and a part name only where
// we have none. Supersession (old -> new number, replaced_by) is read by 05.
//
// Each row: old_pn (often the pre-1972 short number, "682-49"), oem_pn (often the
// post-1972 number, "26237-49"; the export doesn't keep the order: whichever has
// the 3-4 digit "short_base" is the old one), used_on ("36 to 57--OHV",
// "1955 to 1957 -- 74\" OHV", "49 to * -- FL, FLH", "Servi-car 1956-1973."). One
// cell can hold several "years -- group" segments.
//
// Groups -> our vehicles that exist in those years (vehicles never created here):
//   explicit codes (FL, FLH, FX, FXS, FXE, WL, WLA, WLC, WLD, G, GA, K*, XL*)  -> those codes
//   OHV, 74" OHV, OHV twins                                            -> FL, FLH (EL not listed yet)
//   61" OHV                                                            -> EL only (none yet)
//   74" & 80" side valves                                              -> U, UL, UH, ULH, V* family
//   74" side valves                                                    -> U, UL, V, VL, VC, VD, VLD
//   61", 74" & 80" twins / 61" & 74" twins                             -> FL, FLH + side-valve big twins
//   Servi-car(s)                                                       -> G (GA, GD, GE when listed)
//   W models, 45" twins, all W & G models, W & G models, WL & G        -> WL, WLA (+ G when "G" named)
// Anything else (bare years, "all models", "all twins", "solo", radio kits ...) -> review.
// "*" (to latest) = 1984, as in the FL catalog these lists copy. "early/late YYYY" -> low.
//
// Part number on the fitment: the post-1972 number when the row has one, else old_pn.
// Numbers we lack are added to oem_parts (source 'hydra_glide', migration 009) when
// a fitment row or the crosswalk needs them.
//
// --apply (after 03/09/11, which clear hydra_glide rows): deletes earlier hydra_glide
// fitment and parts, inserts this run's. Then 05 -> 06 -> 07 -> 08.
//
// Usage:
//   node scripts/etl/14_hydra_glide.mjs           (dry run, reports/14_hydra_glide_<ts>.txt + review csv)
//   node scripts/etl/14_hydra_glide.mjs --apply

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classify, normalize, cleanDescription } from './lib/parts.mjs';
import { readCsv } from './lib/csv.mjs';

const APPLY = process.argv.includes('--apply');
const HYDRA_CSV = process.env.HYDRA_CSV || path.join(os.homedir(), 'Developer/catalog-extract/hydra/hydra_glide_oem_parts.csv');
const BATCH = 20000;
const OK = ['std', 'modern', 'hardware', 'short_base'];
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const SIDE_74 = ['U', 'UL', 'V', 'VL', 'VC', 'VD', 'VLD'];
const SIDE_80 = ['UH', 'ULH', 'VLH'];
const OHV_74 = ['FL', 'FLH'];
const CODE_WORD = /\b(FLH|FL|FXE|FXS|FX|WLA|WLC|WLD|WLDR|WL|GA|GD|GE|G|KHK|KH|KR|K|XLCH|XLH|XL|ULH|UL|UH|U|VLH|VLD|VL)\b/g;

const yr = (s, ref) => {
  if (s === '*') return 1984;
  const n = Number(s);
  return s.length === 4 ? n : n >= 3 ? 1900 + n : 1900 + n;
};

// Group text -> { codes } | { review: reason }
function groupCodes(g) {
  const t = g.toLowerCase().replace(/0hv/g, 'ohv').replace(/sidevan|sidevalv/g, 'side valv').replace(/\s+/g, ' ').trim();
  if (!t) return { review: 'no_group' };
  if (/except|radio|rca|two way|all models|all twins|^solo$|^solo\b/.test(t)) return { review: `vague:${t.slice(0, 30)}` };
  const codes = new Set();
  if (/servi[- ]?car/.test(t)) codes.add('G');
  if (/side valv/.test(t)) { SIDE_74.forEach((c) => codes.add(c)); if (/80/.test(t)) SIDE_80.forEach((c) => codes.add(c)); }
  if (/\btwins\b/.test(t) && /61|74|80/.test(t) && !/45/.test(t)) { OHV_74.forEach((c) => codes.add(c)); SIDE_74.forEach((c) => codes.add(c)); if (/80/.test(t)) SIDE_80.forEach((c) => codes.add(c)); }
  if (/\bohv\b/.test(t)) { if (/^61"? ?ohv|61" ohv/.test(t) && !/74/.test(t)) return codes.size ? { codes: [...codes] } : { review: 'el_only' }; OHV_74.forEach((c) => codes.add(c)); }
  if (/\bpanhead\b/.test(t)) OHV_74.forEach((c) => codes.add(c)); // Panhead = FL/FLH (EL not listed yet)
  if (/45" twins|\bw models\b|w & g models|wl & g|45" model w\b/.test(t)) { codes.add('WL'); codes.add('WLA'); if (/\bg\b|servi/.test(t)) codes.add('G'); }
  for (const m of g.toUpperCase().matchAll(CODE_WORD)) codes.add(m[1]);
  return codes.size ? { codes: [...codes] } : { review: `unknown_group:${t.slice(0, 30)}` };
}

// used_on cell -> [{ years:[...], low:Set, codes:[...] } | { review }]
// A two-digit number followed by an inch mark is a size ('61", 74" & 80" twins'), not a year.
const Y = String.raw`(\d{4}|\d{2}(?![\d"”'″]))`;
const SEG = new RegExp(String.raw`(?:(early|late)\s+)?${Y}(?:\s*(?:to|-|–)\s*(?:(early|late)\s+)?(\d{4}|\d{2}(?![\d"”'″])|\*)|\s*(?:&|and)\s*(?:(early|late)\s+)?(\d{4}|\d{2}(?![\d"”'″])))?`, 'gi');
function parseUsedOn(raw) {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const hits = [...s.matchAll(SEG)].filter((m) => (m[2].length === 4 ? Number(m[2]) >= 1903 && Number(m[2]) <= 1984 : true));
  if (!hits.length) return [{ review: 'no_years' }];
  const out = [];
  for (let i = 0; i < hits.length; i++) {
    const m = hits[i];
    const a = yr(m[2]);
    let years;
    const low = new Set();
    if (m[4]) { const b = yr(m[4]); if (b < a || b - a > 60) { out.push({ review: 'bad_range' }); continue; } years = Array.from({ length: b - a + 1 }, (_, k) => a + k); if (m[3]) low.add(b); }
    else if (m[6]) { years = [a, yr(m[6])]; if (m[5]) low.add(yr(m[6])); }
    else years = [a];
    if (m[1]) low.add(a);
    // Group: text after this year span up to the next one; a leading group ("Servi-car 1956-1973") counts too.
    const after = s.slice(m.index + m[0].length, hits[i + 1]?.index ?? s.length).replace(/^[\s\-–—.,:]+/, '').replace(/[\s.,;]+$/, '');
    const before = i === 0 ? s.slice(0, m.index).replace(/[\s.,;]+$/, '') : '';
    // Codes may sit after the years ("36 to 57--OHV") or before them ("FL, FLH 1961-1964. Panhead.").
    let g = groupCodes(after || before);
    if (g.review && before) { const gb = groupCodes(`${before} ${after}`); if (!gb.review) g = gb; }
    out.push(g.review ? { review: g.review } : { years, low, codes: g.codes });
  }
  return out;
}

async function main() {
  if (!fs.existsSync(HYDRA_CSV)) throw new Error(`no CSV at ${HYDRA_CSV}`);
  const rows = readCsv(HYDRA_CSV);
  const vehicles = (await app.query('SELECT vehicle_id, year, model_code FROM vehicles')).rows;
  const vOf = new Map(vehicles.map((v) => [`${v.year}|${v.model_code}`, v]));
  const parts = new Map((await app.query(`SELECT oem_number, source, description_clean FROM oem_parts WHERE source <> 'hydra_glide'`)).rows.map((r) => [r.oem_number, r]));
  const have = new Set((await app.query(`SELECT oem_number || '|' || vehicle_id AS k FROM fitment WHERE source <> 'hydra_glide'`)).rows.map((r) => r.k));

  const newParts = new Map(); // oem -> { display, name }
  const pairs = new Map(); // oem|vid -> { conf, ref }
  const review = [];
  const st = { rows: rows.length, withUsed: 0, segs: 0, segOk: 0, pairs: 0, already: 0, noBike: 0 };
  const byGroup = {};
  for (const r of rows) {
    const nums = [r.old_pn, r.oem_pn].map((x) => (x || '').trim()).filter(Boolean).map(classify).filter((c) => OK.includes(c.cls));
    if (!nums.length) { review.push({ row: r.source_row, reason: 'no_usable_number', used_on: r.used_on }); continue; }
    // The post-1972 number carries fitment; old short numbers chain to it via 05.
    const main = nums.find((c) => c.cls !== 'short_base') ?? nums[0];
    const oem = normalize(main.display);
    const name = cleanDescription((r.description || '').toUpperCase()); // cleaner expects catalog upper case
    for (const c of nums) {
      const n = normalize(c.display);
      if (!parts.has(n) && !newParts.has(n)) newParts.set(n, { display: c.display, name, needed: false });
    }
    if (!r.used_on.trim()) continue;
    st.withUsed++;
    for (const seg of parseUsedOn(r.used_on)) {
      st.segs++;
      if (seg.review) { review.push({ row: r.source_row, reason: seg.review, used_on: r.used_on }); byGroup[seg.review.split(':')[0]] = (byGroup[seg.review.split(':')[0]] ?? 0) + 1; continue; }
      st.segOk++;
      const key = seg.codes.sort().join(',');
      byGroup[key] = (byGroup[key] ?? 0) + 1;
      for (const y of seg.years) for (const c of seg.codes) {
        const v = vOf.get(`${y}|${c}`);
        if (!v) { st.noBike++; continue; }
        st.pairs++;
        const k = `${oem}|${v.vehicle_id}`;
        if (have.has(k)) { st.already++; continue; }
        const conf = seg.low.has(y) ? 'low' : 'medium';
        const cur = pairs.get(k);
        if (!cur || (cur.conf === 'low' && conf === 'medium')) pairs.set(k, { conf, ref: `hydra_glide:${r.source_row}` });
        if (newParts.has(oem)) newParts.get(oem).needed = true;
      }
    }
  }
  // Crosswalk numbers 05 will chain: add them too, so chains reach the post-1972 number.
  const partRows = [...newParts].filter(([, p]) => p.needed || true).map(([o, p]) => ({ o, display: p.display, name: p.name }));

  const L = [];
  L.push(`14_hydra_glide — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  L.push(`CSV ${HYDRA_CSV}: ${st.rows} rows, ${st.withUsed} with used_on; segments ${st.segs}, mapped to bikes ${st.segOk}, review ${st.segs - st.segOk}`);
  L.push(`(part, bike-year) pairs on existing bikes: ${st.pairs}; already from an H-D source: ${st.already}; NEW: ${pairs.size} (low ${[...pairs.values()].filter((p) => p.conf === 'low').length}); group years with no bike: ${st.noBike}`);
  L.push(`Part numbers we lack (added as source hydra_glide): ${partRows.length} (${partRows.filter((p) => p.name).length} with a name)`);
  L.push('');
  L.push('Segments by group (codes) / review reason:');
  for (const [k, n] of Object.entries(byGroup).sort((a, b) => b[1] - a[1]).slice(0, 30)) L.push(`  ${String(n).padStart(5)}  ${k}`);
  const vById = new Map(vehicles.map((v) => [String(v.vehicle_id), v]));
  const byBike = {};
  for (const k of pairs.keys()) { const v = vById.get(k.split('|')[1]); const b = `${v.model_code}`; byBike[b] = (byBike[b] ?? 0) + 1; }
  L.push('');
  L.push('New pairs by model: ' + Object.entries(byBike).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${n}`).join(', '));
  L.push('');
  L.push('Sample new pairs:');
  for (const [k, p] of [...pairs].filter((_, i) => i % Math.max(1, Math.floor(pairs.size / 20)) === 0).slice(0, 20)) {
    const [o, vid] = k.split('|'); const v = vById.get(vid);
    L.push(`  ${o.padEnd(10)} ${v.year} ${v.model_code.padEnd(5)} ${p.conf.padEnd(6)} ${p.ref}`);
  }
  fs.mkdirSync('reports', { recursive: true });
  const rp = path.join('reports', `14_hydra_glide_${ts}.txt`);
  fs.writeFileSync(rp, L.join('\n') + '\n');
  fs.writeFileSync(rp.replace('.txt', '_review.csv'), ['row,reason,used_on', ...review.map((r) => [r.row, r.reason, r.used_on].map(csvCell).join(','))].join('\n') + '\n');
  console.log(L.join('\n'));
  console.log(`\n→ ${rp} (+ _review.csv).`);
  if (!APPLY) { console.log('Dry run: nothing written. --apply after migration 009.'); return; }

  const okSrc = (await app.query(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'oem_parts_source_check'`)).rows[0]?.d ?? '';
  if (!okSrc.includes('hydra_glide')) throw new Error('oem_parts.source does not allow hydra_glide: apply packages/db/migrations/009_hydra_glide_source.sql first.');
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    const delF = await client.query(`DELETE FROM fitment WHERE source = 'hydra_glide'`);
    await client.query(`DELETE FROM fitment WHERE source = 'admin' AND oem_number IN (SELECT oem_number FROM oem_parts WHERE source = 'hydra_glide')`);
    const delP = await client.query(`DELETE FROM oem_parts WHERE source = 'hydra_glide' AND oem_number NOT IN (SELECT oem_number FROM fitment)`);
    const insP = await client.query(
      `INSERT INTO oem_parts (oem_number, oem_display, description_clean, chain_root, number_source, source)
       SELECT n, d, c, n, 'extracted', 'hydra_glide' FROM unnest($1::text[], $2::text[], $3::text[]) AS t(n, d, c)
       ON CONFLICT (oem_number) DO NOTHING`,
      [partRows.map((p) => p.o), partRows.map((p) => p.display), partRows.map((p) => p.name)]
    );
    const list = [...pairs].map(([k, p]) => ({ o: k.split('|')[0], v: Number(k.split('|')[1]), ...p }));
    let n = 0;
    for (let i = 0; i < list.length; i += BATCH) {
      const c = list.slice(i, i + BATCH);
      const res = await client.query(
        `INSERT INTO fitment (oem_number, vehicle_id, conditions, condition_source, source, source_ref, confidence)
         SELECT o, v, '{}', 'none', 'hydra_glide', r, cf FROM unnest($1::text[], $2::int[], $3::text[], $4::text[]) AS t(o, v, r, cf)
         ON CONFLICT DO NOTHING`,
        [c.map((x) => x.o), c.map((x) => x.v), c.map((x) => x.ref), c.map((x) => x.conf)]
      );
      n += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`Deleted ${delF.rowCount} hydra_glide fitment rows and ${delP.rowCount} parts; inserted ${insP.rowCount} parts and ${n} fitment rows. Next: 05, 06, 07 --max-hole 3, 08.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => app.end());
