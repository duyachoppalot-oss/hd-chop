// scripts/etl/17_vtwin_oem.mjs
//
// Fitment from the V-Twin Mfg catalog (VTCatalog.pdf, 1,368 pp): H-D numbers printed
// next to a year range + model ("41458-08 2008-up FLHR, FLT"). DATA_RIGHTS row
// approved 2026-10-26 (decision 1b of reports/vtwin_inventory_20261025_233449.txt).
// Third-party source, ranked below every H-D source: it only adds (part, bike) pairs
// no other source has, only for numbers already in oem_parts (never new parts or
// names), confidence 'low', source_ref 'VT p<page>'.
//
// Reading the catalog: word boxes per page (scripts/catalog/pdf_words.py, pdfplumber; cached
// in the OS temp dir) rebuild tables from their "VT No. ... OEM ..." header rows. Each H-D
// number's range comes from its own table row (years, model, ABS/carb notes), else the
// table's title ("Countershaft Group for 1936-85 Big Twin"), else the page title; the
// source_ref says which ('VT p549', 'VT p549 title', 'VT p549 page'). Every range found,
// loaded or not, goes to reports/17_vtwin_ranges_<ts>.csv.
//
// V-Twin prints the span of ITS replacement part next to one H-D number, so its
// years can run past the H-D number's own use. Filters against that:
//   - the bike's platform must be one the number already fits (any source), when
//     the number has fitment at all (stops column bleed: a Sportster seal picking
//     up "2015-20 XG" from the next column);
//   - a row whose years don't overlap or sit within ADJ years of the number's
//     current years (chain-wide) goes to review, not fitment;
//   - no rows in a year + platform where the number's chain already fits some bike
//     (any source): H-D lists every model a number fits in a year, so V-Twin's
//     broader "FLT" can't add models there, and a superseded number can't be
//     carried into years its successor covers;
//   - only year + platforms where no bike has a full H-D book (>= THIN rows from the
//     H-D sources): where any book for that year and platform doesn't list the
//     number, H-D has spoken, also for variants without a book of their own (CVO).
//     In practice: old bikes and years our H-D sources don't cover. --all-bikes
//     lifts this (reported either way);
//   - models named after "except" are left out ("except" naming no model -> review);
//   - a section-default model (no model on the row, table or page) only on parts that
//     already have fitment;
//   - rows with no model at all,
//     Colony-style hardware numbers (4-digit base, -1x suffix) and the Tools
//     section go to review.
//
// Model text -> vehicles (HD_TERMINOLOGY rules, year-aware; vehicles never created):
//   FLT / Touring                 -> touring platform
//   FL   <=1984 -> fl platform;  >1984 -> touring
//   FX   1971-86 -> fx platform; >1986 -> dyna
//   FXR* -> fxr; FXST*/FLST*/Softail/ST -> softail; FXD*/Dyna -> dyna
//   XL / Sportster -> sportster; XG -> street; VRSC -> v_rod
//   any other code (FLHR, FXWG, FLSTC ...) -> codes starting with it
//   Big Twin / BT -> fl, fx, touring, softail, dyna, fxr + side-valve big twins
//   Twin Cam / Evo / M8 / Shovelhead / Panhead / Ironhead -> engine column (Evo with
//   883/1200/XL = Sportster)
//   "-up" ends at UP_YEAR (catalog edition 2025). "Early/Late YYYY" ends count whole.
// Conditions: "w/ABS" -> abs, "without ABS"/"non-ABS" -> non_abs (catalog_text).
//   "carb" skips EFI bikes (tag carb unless the bike is carb); "EFI" skips carb bikes
//   (tag efi unless the bike is efi, same rule as 04).
//
// --apply (after 14; 03/09 clear vtwin rows like the other third-party sources):
// deletes earlier vtwin fitment, inserts this run's. Then 05 -> 06 -> 07 -> 08.
//   Remove the source: DELETE FROM fitment WHERE source = 'vtwin'; then 07 -> 08.
//
// Usage:
//   node scripts/etl/17_vtwin_oem.mjs           (dry run, reports/17_vtwin_oem_<ts>.txt + .csv + review csv)
//   node scripts/etl/17_vtwin_oem.mjs --apply
//   --all-bikes   also add pairs on bikes with a full H-D book
// VTWIN_PDF overrides the PDF path. Needs python3 + pdfplumber. Catalog text never goes in the repo.

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { normalize } from './lib/parts.mjs';

const APPLY = process.argv.includes('--apply');
const ALL_BIKES = process.argv.includes('--all-bikes');
const PDF = process.env.VTWIN_PDF || path.join(os.homedir(), 'Desktop/Stanky/CATALOGS/VTCatalog.pdf');
const UP_YEAR = 2025;
const ADJ = 3;
const BATCH = 5000;
const THIN = 200; // H-D rows per bike below which its H-D coverage counts as thin (median bike has ~1,000)
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const SECTIONS = [[1, 158, 'touring'], [159, 482, 'bigtwin'], [483, 842, 'sec3'], [843, 1028, 'sportster'], [1029, 1274, 'multifit'], [1275, 1368, 'tools']];
const sectionOf = (p) => SECTIONS.find(([a, b]) => p >= a && p <= b)?.[2] ?? '?';
// Section index pages: "Touring", "Big Twin 1984-up", "Classic 1915-1983", "XL 1957-UP". The Classic section also
// carries 45" / Servi-Car / K pages, so its default applies only on pages that name none of those (parsePage).
const SECTION_DEFAULT = { touring: 'TOURING', bigtwin: 'BIG TWIN', sec3: 'BIG TWIN', sportster: 'SPORTSTER' };

// Row anchors: V-Twin numbers (44-0651) and Colony hardware numbers (9787-12), not year ranges.
const VT = /^\d{2}-\d{4}[A-Z]?\*?$|^(?!19\d\d-|20\d\d-)\d{4}-\d{1,2}[A-Z]?\*?$/;
const OEM = /^(?:OEM#?)?(\d{3,5}-\d{2}[A-Z]{0,2}|\d{8})[.,;:)]?$/;
const YR = /(?<!\d)((?:19|20)\d\d)(?:\s*[-–]\s*(?:Early|Late|Mid|E|L)?\s*((?:19|20)?\d\d|up|Up|UP|later|present|Present)(?!\d))?(?!\d)/g;
const MODEL = /(?<![\w])(FL[A-Z0-9]*|FX[A-Z0-9]*|XL[A-Z0-9]*|XG[A-Z0-9]*|VRSC[A-Z]*|KHK|KH|KR|ULH|UL|WLA|WL|Big Twins?|BT|ST|Sportsters?|Touring|Softails?|Dynas?|Twin Cams?|TC|Evo(?:lution)?|M-?8|Milwaukee[- ]Eight|Shovelhead|Panhead|Ironhead|Servi-?Car|45[”"]|61[”"]|64[”"]|74[”"]|80[”"])(?![\w])/g;
const isYearToken = (t) => /^(19|20)\d\d-\d\d/.test(t) && +t.slice(0, 4) <= 2030;

const BIG_TWIN = ['fl', 'fx', 'touring', 'softail', 'dyna', 'fxr'];
const SIDE_VALVE = ['U', 'UH', 'UL', 'ULH', 'V', 'VC', 'VD', 'VL', 'VLD', 'VLH'];

// Word boxes per page (scripts/catalog/pdf_words.py), cached in the OS temp dir.
function pageWords() {
  const dir = path.join(os.tmpdir(), 'hdchop_vtwin', 'words');
  const n = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
  if (n < 1368) execFileSync('python3', ['-I', path.join('scripts', 'catalog', 'pdf_words.py'), PDF, dir], { stdio: 'inherit' });
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => [+f.slice(0, 4), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]);
}

// Words -> lines (same top) -> cells (gap < 9pt).
function linesOf(words) {
  const lines = [];
  for (const w of [...words].sort((a, b) => a[3] - b[3] || a[1] - b[1])) {
    const L = lines.at(-1);
    if (L && Math.abs(L.top - w[3]) < 2.5) L.w.push(w); else lines.push({ top: w[3], w: [w] });
  }
  for (const L of lines) {
    L.w.sort((a, b) => a[1] - b[1]);
    const cells = [[L.w[0]]];
    for (const w of L.w.slice(1)) (w[1] - cells.at(-1).at(-1)[2] < 9 ? cells.at(-1).push(w) : cells.push([w]));
    L.cells = cells.map((c) => ({ x0: c[0][1], x1: c.at(-1)[2], text: c.map((x) => x[0]).join(' '), size: Math.max(...c.map((x) => x[5])), words: c }));
  }
  return lines;
}

// Tables: a header line with a "VT No" cell; the table spans that header's group of cells
// (cells < 60pt apart; a second "VT No" starts the next table) plus 120pt for long last cells.
function tablesOf(lines) {
  const out = [];
  for (const L of lines) {
    const cs = L.cells;
    if (!cs.some((c) => /^VT No/.test(c.text))) continue;
    const groups = [[cs[0]]];
    for (const c of cs.slice(1)) {
      const g = groups.at(-1);
      const secondVt = /^VT No/.test(c.text) && g.some((d) => /^VT No/.test(d.text));
      (c.x0 - g.at(-1).x1 < 60 && !secondVt ? g.push(c) : groups.push([c]));
    }
    groups.forEach((g, i) => {
      if (!g.some((c) => /^VT No/.test(c.text))) return;
      const next = i + 1 < groups.length ? groups[i + 1][0].x0 - 5 : 10000;
      out.push({ top: L.top, x0: g[0].x0 - 5, x1: Math.min(g.at(-1).x1 + 120, next) });
    });
  }
  return out;
}

// Every H-D number on a page -> { display, row, title, pageTitle }:
//   row   = in a table: every cell of its line inside the table (+ wrapped lines below);
//           outside tables: cells right of it up to the next row anchor
//   title = text up to 40pt above the table's header, inside the table, from lines without row anchors
//   pageTitle = the largest type in the top 120pt
function parsePage(page, words) {
  const lines = linesOf(words);
  const sizes = {};
  for (const w of words) sizes[Math.round(w[5])] = (sizes[Math.round(w[5])] ?? 0) + 1;
  const body = +Object.entries(sizes).sort((a, b) => b[1] - a[1])[0][0];
  const pageTitle = lines.filter((L) => L.top < 120).flatMap((L) => L.cells).filter((c) => c.size >= body + 6)
    .sort((a, b) => b.size - a.size).slice(0, 2).map((c) => c.text).join(' ');
  const tables = tablesOf(lines);
  const mixed = words.some((w) => /^(45[”"]|Servi|WLA?$|WR$|G$|K$|KH$|XL|Sportster)/.test(w[0]));
  const inSpan = (d, t) => d.x1 > t.x0 && d.x0 < t.x1;
  const anchor = (d) => VT.test(d.words[0][0]) || (OEM.test(d.words[0][0]) && !isYearToken(d.words[0][0]));
  const rows = [];
  lines.forEach((L, li) => L.cells.forEach((c, ci) => c.words.forEach((w, wi) => {
    const m = OEM.exec(w[0]);
    if (!m || isYearToken(m[1]) || /^\d{4}-1\d/.test(m[1])) return; // year range; Colony hardware
    const t = tables.filter((h) => h.top < L.top && h.x0 <= w[1] && w[1] <= h.x1 && L.top - h.top < 600).sort((a, b) => b.top - a.top)[0];
    const parts = [];
    if (t) {
      for (const d of L.cells.filter((d) => inSpan(d, t))) {
        if (d === c) parts.push([...c.words.slice(0, wi), ...c.words.slice(wi + 1)].map((x) => x[0]).join(' '));
        else if (!VT.test(d.words[0][0])) parts.push(d.text);
      }
      for (const M of lines.slice(li + 1, li + 3)) {
        if (M.top - L.top > 9) break;
        const seg = M.cells.filter((d) => inSpan(d, t));
        if (seg.some(anchor)) break;
        parts.push(...seg.map((d) => d.text));
      }
    } else {
      parts.push(c.words.slice(wi + 1).map((x) => x[0]).join(' '));
      for (const d of L.cells.slice(ci + 1)) {
        if (anchor(d) || d.x0 - c.x1 > 160) break;
        parts.push(d.text);
      }
    }
    // title lines hold no row anchors (a line with V-Twin numbers is another table's row)
    const title = t ? lines.filter((M) => t.top - M.top > 0 && t.top - M.top < 40)
      .map((M) => M.cells.filter((d) => inSpan(d, t))).filter((cs) => !cs.some((d) => d.words.some((x) => VT.test(x[0]))))
      .flat().map((d) => d.text).join(' ') : '';
    rows.push({ page, section: sectionOf(page), mixed, display: m[1], row: parts.filter(Boolean).join(' ').trim(), title, pageTitle, table: !!t });
  })));
  return rows;
}

const endYear = (y1, b) => {
  if (!b) return y1;
  if (/up|later|present/i.test(b)) return UP_YEAR;
  let y2 = b.length === 4 ? +b : +(String(y1).slice(0, 2) + b);
  if (y2 < y1) y2 += 100;
  return y2;
};

// Text -> [{ y1, y2, models[] }]: each year range takes the model words after it
// (the first one also those before it).
function segments(text) {
  const yrs = [...text.matchAll(YR)].filter((m) => endYear(+m[1], m[2]) - +m[1] <= 90);
  if (!yrs.length) return [];
  const before = [...text.slice(0, yrs[0].index).matchAll(MODEL)].map((m) => m[1]);
  return yrs.map((m, i) => {
    const tail = text.slice(m.index + m[0].length, i + 1 < yrs.length ? yrs[i + 1].index : undefined);
    let models = [...tail.matchAll(MODEL)].map((x) => x[1]);
    if (!models.length && i === 0) models = before;
    return { y1: +m[1], y2: endYear(+m[1], m[2]), models };
  });
}
const modelsIn = (text) => [...text.matchAll(MODEL)].map((m) => m[1]);

// Row -> its year segments, each with models. Years: row, else table title, else page title.
// Models: the segment's own, else row, title, page title, section default (Touring/Sportster).
function rangesOf(r) {
  const [ysrc, text] = segments(r.row).length ? ['row', r.row] : segments(r.title).length ? ['title', r.title] : segments(r.pageTitle).length ? ['page', r.pageTitle] : ['', ''];
  return segments(text).map((s) => {
    let models = s.models, msrc = ysrc;
    for (const [src, t] of [['row', r.row], ['title', r.title], ['page', r.pageTitle]]) {
      if (models.length) break;
      models = modelsIn(t); msrc = src;
    }
    if (!models.length && SECTION_DEFAULT[r.section] && !(r.section === 'sec3' && r.mixed)) { models = [SECTION_DEFAULT[r.section]]; msrc = 'section'; }
    if (!models.length) msrc = '';
    return { ...s, models, ysrc, msrc };
  });
}

function conditionsOf(win) {
  const abs = /w\/ ?ABS|with ABS|\bABS brakes\b/i.test(win) && !/without ABS|w\/o ?ABS|non[- ]?ABS/i.test(win);
  const nonAbs = /without ABS|w\/o ?ABS|non[- ]?ABS/i.test(win) && !/ABS\/Non|and non/i.test(win);
  const carb = /\bcarb/i.test(win);
  const efi = /\bEFI\b|fuel[- ]?inject/i.test(win);
  return { abs, nonAbs, carb: carb && !efi, efi: efi && !carb };
}

async function main() {
  if (!fs.existsSync(PDF)) throw new Error(`no PDF at ${PDF}`);
  const raw = pageWords().flatMap(([page, words]) => (sectionOf(page) === 'tools' || page > 1368 || !words.length ? [] : parsePage(page, words)));
  for (const r of raw) r.win = `${r.row} | ${r.title}`;

  const vehicles = (await app.query('SELECT vehicle_id, year, model_code, platform, engine, fuel_system FROM vehicles')).rows;
  const parts = new Map((await app.query('SELECT oem_number, chain_root FROM oem_parts')).rows.map((r) => [r.oem_number, r]));
  const have = new Set();
  const platOf = new Map(); // oem -> Set(platform)
  const chainYears = new Map(); // chain_root -> [min, max]
  const chainYP = new Set(); // chain_root|year|platform with fitment
  const hdRows = new Map(); // vehicle_id -> rows from H-D sources (book coverage)
  const vById = new Map(vehicles.map((v) => [v.vehicle_id, v]));
  for (const r of (await app.query(`SELECT f.oem_number, f.vehicle_id, f.source, v.platform, v.year, p.chain_root
      FROM fitment f JOIN vehicles v USING (vehicle_id) JOIN oem_parts p USING (oem_number) WHERE f.source <> 'vtwin'`)).rows) {
    have.add(`${r.oem_number}|${r.vehicle_id}`);
    chainYP.add(`${r.chain_root}|${r.year}|${r.platform}`);
    if (['oem_catalog', 'service_catalog', 'catalog_ocr'].includes(r.source)) hdRows.set(r.vehicle_id, (hdRows.get(r.vehicle_id) ?? 0) + 1);
    if (!platOf.has(r.oem_number)) platOf.set(r.oem_number, new Set());
    platOf.get(r.oem_number).add(r.platform);
    const c = chainYears.get(r.chain_root);
    if (!c) chainYears.set(r.chain_root, [r.year, r.year]);
    else { c[0] = Math.min(c[0], r.year); c[1] = Math.max(c[1], r.year); }
  }

  // model token + year -> vehicle filter
  const engineFilter = (tok, seg) => {
    const t = tok.toUpperCase();
    const sporty = seg.models.some((x) => /^XL|^SPORTSTER/i.test(x)) || /883|1200/.test(seg.win);
    if (/^(TWIN CAMS?|TC)$/.test(t)) return (v) => v.engine === 'twin_cam' && v.platform !== 'trike';
    if (/^EVO/.test(t)) return sporty ? (v) => v.engine === 'evolution_sportster' : (v) => v.engine === 'evolution_bigtwin';
    if (/^(M-?8|MILWAUKEE[- ]EIGHT)$/.test(t)) return (v) => v.engine === 'milwaukee_eight' && v.platform !== 'trike';
    if (t === 'SHOVELHEAD') return (v) => v.engine === 'shovelhead';
    if (t === 'PANHEAD') return (v) => v.engine === 'panhead';
    if (t === 'IRONHEAD') return (v) => v.engine === 'ironhead';
    return null;
  };
  const tokenFilter = (tok, seg) => {
    const t = tok.toUpperCase().replace(/^(BIG TWIN|SPORTSTER|SOFTAIL|DYNA|TWIN CAM)S$/, '$1');
    const e = engineFilter(t, seg);
    if (e) return e;
    if (t === 'FLT' || t === 'TOURING') return (v) => v.platform === 'touring';
    if (t === 'FL') return (v) => (v.year <= 1984 ? v.platform === 'fl' : v.platform === 'touring');
    if (t === 'FX') return (v) => (v.year <= 1986 ? v.platform === 'fx' : v.platform === 'dyna');
    if (t === 'XL' || t === 'SPORTSTER') return (v) => v.platform === 'sportster';
    if (t === 'SOFTAIL' || t === 'ST') return (v) => v.platform === 'softail';
    if (t === 'DYNA') return (v) => v.platform === 'dyna';
    if (t === 'XG') return (v) => v.platform === 'street';
    if (t.startsWith('VRSC')) return (v) => v.platform === 'v_rod';
    if (/^(61|64)[”"]$/.test(t)) return (v) => /^EL/.test(v.model_code); // 61" OHV = EL Knucklehead (none in vehicles yet)
    if (/^(74|80)[”"]$/.test(t)) return (v) => ['fl', 'fx', 'touring', 'softail', 'dyna', 'fxr'].includes(v.platform) || SIDE_VALVE.includes(v.model_code);
    if (/^45[”"]$/.test(t) || /^SERVI-?CAR$/.test(t)) return (v) => v.platform === 'vintage' && /^(W|G)/.test(v.model_code);
    if (t === 'BIG TWIN' || t === 'BT') return (v) => BIG_TWIN.includes(v.platform) || SIDE_VALVE.includes(v.model_code);
    if (t.startsWith('FXR')) return (v) => v.platform === 'fxr' && v.model_code.startsWith(t);
    return (v) => v.model_code.startsWith(t);
  };

  // vintage holds several families (U/V side-valve big twins, W, G, K): one book each
  const bookKey = (v) => `${v.year}|${v.platform === 'vintage' ? `vintage_${v.model_code[0]}` : v.platform}`;
  const bookYP = new Set([...hdRows].filter(([, n]) => n >= THIN).map(([id]) => bookKey(vById.get(id))));
  const pairs = new Map(); // oem|vid|conds -> row
  const review = [];
  const st = { tokens: raw.length, withYears: 0, notInParts: 0, except: 0, sectionNoFit: 0, noModel: 0, bySrc: {}, noBike: 0, wrongPlatform: 0, chainCovered: 0, fullBook: 0, farYears: 0, already: 0, candidates: 0 };
  const rev = (r, reason, extra = '') => review.push({ page: r.page, oem: r.display, reason, win: r.win.slice(0, 90), extra });

  for (const r of raw) {
    const segs = rangesOf(r);
    r.segs = segs;
    if (!segs.length) continue;
    st.withYears++;
    const n = normalize(r.display);
    const part = parts.get(n);
    if (!part) { st.notInParts++; rev(r, 'not_in_oem_parts'); continue; }
    // "except FXDWG, FXDF": models named after "except" (up to the next year range) are left out;
    // an "except" that names no model we know goes to review.
    const exc = /\bexcept\b(.*)/i.exec(r.win);
    const excludeModels = exc ? modelsIn(exc[1].split(/(?:19|20)\d\d/)[0]) : [];
    if (exc && !excludeModels.length) { st.except++; rev(r, 'except'); continue; }
    const cond = conditionsOf(r.win);
    const plats = platOf.get(n);
    const cy = chainYears.get(part.chain_root);
    for (const seg of segs) {
      seg.win = r.win;
      const models = seg.models.filter((m) => !excludeModels.includes(m));
      if (!models.length) { st.noModel++; rev(r, 'no_model', `${seg.y1}-${seg.y2}`); continue; }
      if (seg.msrc === 'section' && !plats) { st.sectionNoFit++; rev(r, 'section_model_part_without_fitment', `${seg.y1}-${seg.y2} ${models.join(',')}`); continue; }
      if (cy && (seg.y2 < cy[0] - ADJ || seg.y1 > cy[1] + ADJ)) { st.farYears++; rev(r, 'years_far_from_ours', `${seg.y1}-${seg.y2} vs ${cy[0]}-${cy[1]}`); continue; }
      const filters = models.map((m) => tokenFilter(m, seg));
      const excl = excludeModels.map((m) => tokenFilter(m, seg));
      const ohv = /Knucklehead|Panhead|\bOHV\b/i.test(r.win); // overhead-valve text never means the U/V side-valve twins
      const vs = vehicles.filter((v) => v.year >= seg.y1 && v.year <= seg.y2 && filters.some((f) => f(v)) && !excl.some((f) => f(v))
        && !(ohv && SIDE_VALVE.includes(v.model_code)));
      if (!vs.length) { st.noBike++; rev(r, 'no_bike', `${seg.y1}-${seg.y2} ${models.join(',')}`); continue; }
      for (const v of vs) {
        if (plats && !plats.has(v.platform)) { st.wrongPlatform++; continue; }
        if (cond.carb && v.fuel_system === 'efi') continue;
        if (cond.efi && v.fuel_system === 'carb') continue;
        st.candidates++;
        if (have.has(`${n}|${v.vehicle_id}`)) { st.already++; continue; }
        if (chainYP.has(`${part.chain_root}|${v.year}|${v.platform}`)) { st.chainCovered++; continue; }
        if (!ALL_BIKES && bookYP.has(bookKey(v))) { st.fullBook++; continue; }
        const conditions = [];
        if (cond.abs) conditions.push('abs');
        if (cond.nonAbs) conditions.push('non_abs');
        if (cond.carb && v.fuel_system !== 'carb') conditions.push('carb');
        if (cond.efi && v.fuel_system !== 'efi') conditions.push('efi');
        conditions.sort();
        const k = `${n}|${v.vehicle_id}|${conditions.join(',')}`;
        const ref = `VT p${r.page}${seg.ysrc === 'row' ? '' : ` ${seg.ysrc}`}`; // years from the row, table title or page title
        if (!pairs.has(k)) { pairs.set(k, { oem: n, display: r.display, vehicle_id: v.vehicle_id, year: v.year, model_code: v.model_code, platform: v.platform, conditions, ref, page: r.page, newPart: !plats }); st.bySrc[seg.ysrc] = (st.bySrc[seg.ysrc] ?? 0) + 1; }
      }
    }
  }

  const P = [...pairs.values()];
  const L = [];
  L.push(`17_vtwin_oem ${APPLY ? 'APPLY' : 'DRY RUN'} ${ts}  PDF ${PDF}`);
  const ys = raw.reduce((a, r) => ((a[r.segs?.[0]?.ysrc || 'none'] = (a[r.segs?.[0]?.ysrc || 'none'] ?? 0) + 1), a), {});
  L.push(`H-D number tokens ${st.tokens} (${raw.filter((r) => r.table).length} in tables; Tools section and Colony numbers left out); years from: ${Object.entries(ys).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  L.push(`with years ${st.withYears}; not in oem_parts ${st.notInParts} (review); "except" naming no model ${st.except} (review); section-default model on a part with no fitment ${st.sectionNoFit} (review)`);
  L.push(`segments with no model ${st.noModel}; years > ${ADJ} from the number's chain years ${st.farYears}; no bike in years ${st.noBike} (all review)`);
  L.push(`(part, bike) candidates ${st.candidates}; dropped, platform the number never fits ${st.wrongPlatform}; already from another source ${st.already}; year + platform the chain already covers ${st.chainCovered}`);
  L.push(`NEW vtwin fitment rows: ${P.length}; parts ${new Set(P.map((p) => p.oem)).size}; bikes ${new Set(P.map((p) => p.vehicle_id)).size}; rows on parts with no fitment yet ${P.filter((p) => p.newPart).length}`);
  const cnt = (f) => Object.entries(P.reduce((a, p) => ((a[f(p)] = (a[f(p)] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  L.push(`${ALL_BIKES ? 'INCLUDED (--all-bikes)' : 'skipped'}: in a year + platform with a full H-D book (a bike with >= ${THIN} H-D rows) ${ALL_BIKES ? P.filter((p) => bookYP.has(bookKey(vById.get(p.vehicle_id)))).length : st.fullBook}`);
  L.push(`new rows by where the years came from: ${Object.entries(st.bySrc).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  L.push(`by platform: ${cnt((p) => p.platform).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  L.push(`by decade: ${cnt((p) => `${Math.floor(p.year / 10) * 10}s`).sort().map(([k, v]) => `${k} ${v}`).join(', ')}`);
  L.push(`conditions: ${cnt((p) => p.conditions.join(',') || '{}').map(([k, v]) => `${k} ${v}`).join(', ')}`);
  L.push(`review reasons: ${Object.entries(review.reduce((a, r) => ((a[r.reason] = (a[r.reason] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  L.push('', '20 sample new rows (oem, bike, conditions, page):');
  const step = Math.max(1, Math.floor(P.length / 20));
  for (let i = 0; i < P.length && i / step < 20; i += step) {
    const p = P[i];
    L.push(`  ${p.display.padEnd(11)} ${p.year} ${p.model_code.padEnd(9)} {${p.conditions.join(',')}} ${p.ref}${p.newPart ? '  (part had no fitment)' : ''}`);
  }
  L.push('', '20 sample review rows:');
  const rs = Math.max(1, Math.floor(review.length / 20));
  for (let i = 0; i < review.length && i / rs < 20; i += rs) { const r = review[i]; L.push(`  p${r.page} ${r.oem.padEnd(11)} ${r.reason.padEnd(20)} ${r.extra} | ${r.win}`); }

  fs.mkdirSync('reports', { recursive: true });
  const rp = path.join('reports', `17_vtwin_oem_${ts}.txt`);
  fs.writeFileSync(rp, L.join('\n') + '\n');
  fs.writeFileSync(path.join('reports', `17_vtwin_oem_${ts}.csv`),
    ['oem,year,model_code,platform,conditions,source_ref,part_had_no_fitment', ...P.map((p) => [p.display, p.year, p.model_code, p.platform, p.conditions.join(' '), p.ref, p.newPart].map(csvCell).join(','))].join('\n') + '\n');
  // Every range the catalog states, loaded or not (internal: catalog text stays in reports/, gitignored).
  fs.writeFileSync(path.join('reports', `17_vtwin_ranges_${ts}.csv`),
    ['page,oem,in_oem_parts,year_start,year_end,models,years_from,models_from,row,table_title',
      ...raw.flatMap((r) => (r.segs?.length ? r.segs : [{ y1: '', y2: '', models: [], ysrc: '', msrc: '' }]).map((g) =>
        [r.page, r.display, parts.has(normalize(r.display)), g.y1, g.y2, g.models.join(' '), g.ysrc, g.msrc, r.row.slice(0, 120), r.title.slice(0, 120)].map(csvCell).join(',')))].join('\n') + '\n');
  fs.writeFileSync(path.join('reports', `17_vtwin_oem_review_${ts}.csv`),
    ['page,oem,reason,detail,cell', ...review.map((r) => [r.page, r.oem, r.reason, r.extra, r.win].map(csvCell).join(','))].join('\n') + '\n');
  console.log(L.slice(0, 12).join('\n'));
  console.log(`report: ${rp}`);

  if (APPLY) {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      const del = await client.query(`DELETE FROM fitment WHERE source = 'vtwin'`);
      let ins = 0;
      for (let i = 0; i < P.length; i += BATCH) {
        const b = P.slice(i, i + BATCH);
        const res = await client.query(
          `INSERT INTO fitment (oem_number, vehicle_id, conditions, condition_source, source, source_ref, confidence)
           SELECT o, v, string_to_array(c, ',')::text[] , CASE WHEN c = '' THEN 'none' ELSE 'catalog_text' END, 'vtwin', r, 'low'
           FROM unnest($1::text[], $2::int[], $3::text[], $4::text[]) AS t(o, v, c, r)
           ON CONFLICT DO NOTHING`,
          [b.map((p) => p.oem), b.map((p) => p.vehicle_id), b.map((p) => p.conditions.join(',')), b.map((p) => p.ref)]);
        ins += res.rowCount;
      }
      await client.query('COMMIT');
      console.log(`deleted ${del.rowCount} old vtwin rows, inserted ${ins}. Next: 05 -> 06 -> 07 --max-hole 3 -> 08.`);
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  await app.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
