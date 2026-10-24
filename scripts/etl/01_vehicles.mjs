// scripts/etl/01_vehicles.mjs
//
// Populates `vehicles` in APP_DATABASE_URL from the source catalog's
// harley_families -> harley_models -> harley_model_years chain (the live
// year+model picker in Stinkin-Supplies' app/api/harley/[family]/models).
//
// The picker pads model years (e.g. FLT "Tour Glide" 1939-2026, XL 1936-1952,
// FX 1941-2026), so a picker row is loaded only when another source shows the
// model existed that year: hd_year_model_master, oem_fitment.model_codes, a
// model code in hd_oem_catalog_reference.used_on_raw / vehicle_model, or a model
// code in the models column of a scraped H-D service-portal catalog
// (lib/servicecatalog.mjs; single-year books, or "FXDB 1992" in multi-year
// ones). That last source fills numbered CVO (FLHTCUSE2-8), V-Rod and Police
// years stinkin_catalog has no single-year catalog for. It only confirms
// picker rows; it never adds a model the picker lacks. The rest
// goes to the review CSV. A vehicle with no catalog evidence would have no
// fitment anyway. Catalog evidence counts only from single-year rows: a
// "1952-66" row listing XLH doesn't mean XLH existed in 1952. Rows backed only
// by multi-year spans are reviewed as catalog_span_only.
//
// Exception, pre-1985 catalogs (added 2026-10-24): their rows name models with
// explicit year ranges ("74 to 77 - FX, FXE", "80 to * - FXWG", "71 & 72 - FX")
// in multi-year books such as the 1971-84 FX catalog. A range that names a
// code is evidence for each year it states ("*" = to the book's last year).
// "All Models" ranges name nothing and don't count. In these books bare FL/FX/XL
// are the models themselves (1971 FX = Super Glide), so FAMILY_TOKENS don't
// apply to this evidence.
//
// Every run also writes the proposed vehicles to reports/01_vehicles_<ts>.json
// so 03 can preview their fitment before 01 is applied (03 --vehicles-from).
//
// platform: lowercase, from the family (002 CHECK). Flathead/Knucklehead/
// Panhead/Shovelhead families are engine eras, so their models get platform
// 'vintage' -- unless the same (year, code) is also listed under a platform
// family, in which case platform comes from that family and engine from the
// era family.
//
// engine: hd_engine_types.engine_key whose year range covers the year, among
// the engines that platform used. Years where two ranges meet (1984, 1999,
// 2017) use OVERLAP_ENGINE or stay null.
//
// fuel_system: 'efi' for EFI "...I" codes (code ends in I and the code without
// the I is also a picker code). Everything else stays 'unknown'; step 04 may
// refine it.
//
// Usage:
//   node scripts/etl/01_vehicles.mjs            (dry-run, prints + writes report only)
//   node scripts/etl/01_vehicles.mjs --apply    (writes to APP_DATABASE_URL)

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { readBooks, available as serviceCatalogAvailable } from './lib/servicecatalog.mjs';
import { parseUsedOn, splitUsedOn } from './lib/usedon.mjs';
import * as shovelHistory from '../catalog/specs/shovelhead_model_history.mjs';
import { bookBySlug } from '../catalog/books.mjs';

const APPLY = process.argv.includes('--apply');

const source = new pg.Pool({ connectionString: process.env.SOURCE_DATABASE_URL });
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

const VEHICLES_YEAR_MIN = 1936; // vehicles CHECK constraint
const VEHICLES_YEAR_MAX = 2030;

// harley_families.name -> vehicles.platform. Families not listed here (Twin Cam,
// Evolution: engine eras with no models today) send their rows to review.
const PLATFORM = {
  Touring: 'touring',
  Softail: 'softail',
  Dyna: 'dyna',
  Trike: 'trike',
  Sportster: 'sportster',
  FXR: 'fxr',
  'V-Rod': 'v_rod',
  Street: 'street',
  'Revolution Max': 'revolution_max',
};
const VINTAGE = new Set(['Flathead', 'Knucklehead', 'Panhead', 'Shovelhead']);

// Chassis families the picker doesn't have (005, docs/HD_TERMINOLOGY.md). They
// override whatever family the picker filed the code under: the picker puts
// 1986 FXWG/FXSB under Softail ("BREAKOUT") and FXEF under FXR, but all three
// are FX swingarm bikes -- the 1984-86 FX-FXST catalog lists "85 to * - FXWG,
// FXSB, FXEF" next to, not as, the FXST; 1986 "Late 86 - FXWG" is the last.
const FX_CHASSIS = new Set(['FX', 'FXE', 'FXS', 'FXEF', 'FXWG', 'FXB', 'FXSB', 'FXDG']); // FXDG = 1983 Disc Glide
const FL_CHASSIS = new Set(['EL', 'ES', 'FL', 'FLH', 'FLHS', 'FLHF', 'FLHC', 'FLHB', 'FLHFB', 'FLP', 'FLHP', 'FLF', 'FLE', 'FLS', 'FLHX']);
function chassisPlatform(year, code) {
  if (year <= 1986 && FX_CHASSIS.has(code)) return 'fx';
  if (year <= 1984 && FL_CHASSIS.has(code)) return 'fl';
  return null;
}

// Ironhead Sportsters (added 2026-10-24). The picker and hd_year_model_master
// carry a generic XL "Sportster" for 1957-85 and XLH only for 1976/78/84/85.
// H-D's 1954-78 XLH/XLCH parts catalog (Laken's PDF, read by
// scripts/catalog; docs/CATALOG_READER.md) names XL from 1957 and XLH/XLCH
// from 1958 ("58 - XLH" rows, "58 to * - XLH, XLCH"), and for 1977-78 writes
// "XL, XLCH" and "XLH, XLCH" for the same kinds of parts: in that book XL
// after 1957 is the XLH. So:
//   - XL_BOOK years count as evidence for XLH and XLCH (the picker has both
//     codes those years; this never adds a code the picker lacks).
//   - XL is a model only in 1957; later XL rows are the family label and go to
//     review as xl_family_label. --apply deletes those vehicles and their
//     fitment (03 maps the book's "XL" 1958-78 to XLH, lib/fitment.mjs).
//   - XLH before 1972 is the 55 ci (883 cc) bike; the picker's "SPORTSTER 1000"
//     name is wrong there, so it's left empty.
// XLH 1979-83 and XLS 1979-82 (the Roadster) still have no source; they need
// the 1979-85 Sportster parts catalog.
const XL_BOOK = { XLH: [1958, 1978], XLCH: [1958, 1978] };

// H-D documents that state model-years outright (added 2026-10-24, vintage
// bikes). Unlike catalog code lists ("41 to * - FL, FLH" = whichever existed),
// these name each model with its own years:
//   - 99427-84 "Shovelhead Model History" (scripts/catalog/specs): FL 1966-80,
//     FLH 1966-84, FLHS, FLH Classic (FLHC) 1979-84, FLT, FLTC, FLHT/FLHTC,
//     FLHF and the FX family. Rows the transcription marks for review still
//     count when their years are what the table prints.
//   - TM 10-1482 WLA parts list: quantity columns 1940, 1941, 1942 WLA.
// A (code, year) here is evidence, and may add a code the picker lacks for that
// year (e.g. FLHC 1979-84; the picker only has the 2018+ Softail FLHC). Added
// bikes take no picker name (the app shows the code); their family comes from
// the chassis rules (FL/FX) or FLT -> Touring, WLA -> Flathead.
const DOC_YEARS = new Map(); // "year|code" -> source
for (const r of shovelHistory.ROWS)
  if (r.code) for (let y = r.from; y <= r.to; y++) DOC_YEARS.set(`${y}|${r.code}`, shovelHistory.SOURCE.key);
for (const c of bookBySlug('1942-wla').columns) DOC_YEARS.set(`${c.year}|${c.code}`, 'TM 10-1482');
// Panhead FL/FLH (1948-65, Laken). The 1941-84 FL catalog's rows that name one
// model alone ("55 to 64 - FLH", "41 to 64 - FL"), counted 2026-10-24: FLH from
// 1955 (8-11 rows a year), none before; FL every year (5-7 rows 1953-65, one row
// for 1948-52). EL 1948-52 and FLF/FLHF/FLE/FLP/FLHP have no such rows yet
// (need the 1948-53 / 1949-60 catalogs).
for (let y = 1948; y <= 1965; y++) DOC_YEARS.set(`${y}|FL`, '1941-84 FL catalog');
for (let y = 1955; y <= 1965; y++) DOC_YEARS.set(`${y}|FLH`, '1941-84 FL catalog');
// 1986-90 XLH Evolution Sportster catalog (99451-90 era, (c) 1989), page 2 V.I.N. table:
// 1986 XLH 883, 883 Deluxe, 1100; 1987 adds the 883 Hugger; 1988-90 XLH 883, 1200,
// 883 Hugger, 883 Deluxe.
const EVO_XL_TABLE = {
  1986: ['XLH883', 'XLH883DLX', 'XLH1100'],
  1987: ['XLH883', 'XLH883DLX', 'XLH1100', 'XLH883HUG'],
  1988: ['XLH883', 'XLH1200', 'XLH883HUG', 'XLH883DLX'],
  1989: ['XLH883', 'XLH1200', 'XLH883HUG', 'XLH883DLX'],
  1990: ['XLH883', 'XLH1200', 'XLH883HUG', 'XLH883DLX'],
};
for (const [y, codes] of Object.entries(EVO_XL_TABLE)) for (const c of codes) DOC_YEARS.set(`${y}|${c}`, '1986-90 XLH catalog VIN table');
// Sportster codes that table rules out for 1986-90: the master's generic "XL883 Sportster
// 883" (XL883 as a model starts with the 1991 books) and a 1986 XLX (the XLX-61 ended 1985).
const NOT_EVO_XL = (year, code) => year >= 1986 && year <= 1990 && /^XL/.test(code) && !EVO_XL_TABLE[year].includes(code) && code !== 'XLH';
const docFamily = (code) =>
  /^FLT|^FLHT/.test(code) ? 'Touring' : code.startsWith('XL') ? 'Sportster' : code.startsWith('W') ? 'Flathead' : 'Shovelhead';
const XL_MODEL_YEARS = [1957, 1957];

// Bare family abbreviations in catalog text ("FX" = Dyna/FX family, "FL" =
// Touring) aren't the FL/FX/XL models, so only hd_year_model_master counts.
const FAMILY_TOKENS = new Set(['FL', 'FX', 'XL']);

// Engines each platform used, matched by hd_engine_types year range.
// Sportster before 1957 is the flathead K model: left null rather than letting
// the 1929-1973 flathead range collide with ironhead.
const BIG_TWIN = ['knucklehead', 'panhead', 'shovelhead', 'evolution_bigtwin', 'twin_cam', 'milwaukee_eight'];
const PLATFORM_ENGINES = {
  touring: BIG_TWIN,
  softail: BIG_TWIN,
  dyna: BIG_TWIN,
  trike: BIG_TWIN,
  fxr: ['shovelhead', 'evolution_bigtwin'],
  fx: ['shovelhead', 'evolution_bigtwin'],
  // evolution listed so 1984 (Shovel and Evo FLH) stays null rather than guessed
  fl: ['knucklehead', 'panhead', 'shovelhead', 'evolution_bigtwin'],
  sportster: ['ironhead', 'evolution_sportster'],
  v_rod: ['revolution'],
  revolution_max: ['revolution_max'],
  street: [], // Revolution X: no hd_engine_types entry
};

// Changeover years where two engine ranges overlap.
const OVERLAP_ENGINE = {
  // Softail launched with the Evo; 1984 FX-frame bikes were still Shovels (the
  // 1985 FXEF was "the first and last" Evo FXEF).
  // FL-frame 1984 bikes are Shovels: the 99427-84 Shovelhead Model History runs
  // FLH 80 and FLH 80 Classic to 1984; the Evo came with the 1985 FLT-chassis bikes.
  1984: { softail: 'evolution_bigtwin', fx: 'shovelhead', fl: 'shovelhead' },
  1999: { touring: 'twin_cam', dyna: 'twin_cam', softail: 'evolution_bigtwin' }, // Softail got the TC88B in 2000
  2017: { touring: 'milwaukee_eight', trike: 'milwaukee_eight', softail: 'twin_cam', dyna: 'twin_cam' },
};

// FXLR is listed under both FXR (1987-1994) and Softail (1988-2025). The
// Softail Low Rider only took the FXLR code in 2018; before that it's the FXR.
function resolvePlatformConflict(year, code, platforms) {
  if (code === 'FXLR' && year < 2018 && platforms.has('fxr') && platforms.has('softail')) return 'fxr';
  return null;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function loadEvidence(codes) {
  const key = (r) => `${r.year}|${r.code}`;
  const master = await source.query(
    `SELECT DISTINCT year, upper(trim(model_code)) AS code, model_name FROM hd_year_model_master`
  );
  const fitment = await source.query(
    `SELECT DISTINCT y AS year, upper(mc) AS code,
            coalesce(f.catalog_year_end, f.catalog_year_start) = f.catalog_year_start AS single_year
     FROM oem_fitment f, unnest(f.model_codes) mc,
          generate_series(f.catalog_year_start::int, coalesce(f.catalog_year_end, f.catalog_year_start)::int) y
     WHERE f.catalog_year_start BETWEEN 1903 AND 2027
       AND coalesce(f.catalog_year_end, f.catalog_year_start) - f.catalog_year_start < 15
       AND upper(mc) = ANY($1)`,
    [codes]
  );
  const reference = await source.query(
    `SELECT DISTINCT y AS year, t AS code,
            coalesce(r.year_end, r.year_start) = r.year_start AS single_year
     FROM hd_oem_catalog_reference r,
          regexp_split_to_table(upper(coalesce(r.used_on_raw, '') || ' ' || coalesce(r.vehicle_model, '')), '[^A-Z0-9]+') t,
          generate_series(r.year_start::int, coalesce(r.year_end, r.year_start)::int) y
     WHERE r.year_start BETWEEN 1903 AND 2027
       AND coalesce(r.year_end, r.year_start) - r.year_start < 15
       AND t = ANY($1)`,
    [codes]
  );
  // Scraped service-portal books: every token of the models column in a
  // single-year book, plus "CODE YYYY" pairs in multi-year books.
  const service = new Set();
  if (serviceCatalogAvailable()) {
    const want = new Set(codes);
    for (const r of readBooks().rows) {
      const text = (r.used_on_raw || '').toUpperCase();
      if (r.year_start === r.year_end)
        for (const t of text.split(/[^A-Z0-9]+/)) if (want.has(t)) service.add(`${r.year_start}|${t}`);
      for (const m of text.matchAll(/\b([A-Z][A-Z0-9]+) (\d{4})\b/g)) {
        const y = Number(m[2]);
        if (want.has(m[1]) && y >= r.year_start && y <= r.year_end) service.add(`${y}|${m[1]}`);
      }
    }
  }
  // Pre-1985 catalogs: explicit "YY to YY - CODES" ranges (see header).
  const range = new Set();
  const want = new Set(codes);
  const old = await source.query(
    `SELECT used_on_raw, year_start, year_end FROM hd_oem_catalog_reference
     WHERE year_start BETWEEN 1903 AND 1984 AND used_on_raw IS NOT NULL`
  );
  for (const r of old.rows.flatMap((r) => splitUsedOn(r.used_on_raw).map((used_on_raw) => ({ ...r, used_on_raw })))) {
    const p = parseUsedOn(r.used_on_raw);
    const end = r.year_end ?? r.year_start;
    if (p.kind === 'range' && p.items)
      for (const item of p.items)
        for (const c of item.alts)
          if (want.has(c)) for (let y = p.from; y <= (p.to ?? end); y++) if (y >= r.year_start && y <= end) range.add(`${y}|${c}`);
    if (p.kind === 'codes')
      for (const item of p.items) for (const c of item.alts) if (item.year && want.has(c)) range.add(`${item.year}|${c}`);
  }
  return {
    masterRows: master.rows,
    master: new Set(master.rows.map(key)),
    fitment: new Set(fitment.rows.filter((r) => r.single_year).map(key)),
    reference: new Set(reference.rows.filter((r) => r.single_year).map(key)),
    span: new Set([...fitment.rows, ...reference.rows].map(key)),
    service,
    range,
  };
}

function engineFor(platform, year, eraFamily, engines, familyEngine) {
  if (eraFamily) {
    const k = familyEngine.get(eraFamily);
    const e = k && engines.get(k);
    return e && year >= e.year_start && year <= (e.year_end ?? 9999) ? k : null;
  }
  const hits = (PLATFORM_ENGINES[platform] || []).filter((k) => {
    const e = engines.get(k);
    return e && year >= e.year_start && year <= (e.year_end ?? 9999);
  });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return OVERLAP_ENGINE[year]?.[platform] ?? null;
  return null;
}

async function main() {
  const { rows } = await source.query(`
    SELECT hmy.year, hm.id AS model_id, upper(trim(hm.model_code)) AS code,
           hm.name AS model_name, hf.name AS family, hm.filter_group
    FROM harley_model_years hmy
    JOIN harley_models hm ON hm.id = hmy.model_id
    JOIN harley_families hf ON hf.id = hm.family_id
    WHERE hm.model_code IS NOT NULL AND trim(hm.model_code) <> ''
    ORDER BY hmy.year, code, hm.id
  `);
  const engines = new Map(
    (await source.query(`SELECT engine_key, year_start, year_end FROM hd_engine_types`)).rows.map((e) => [e.engine_key, e])
  );
  const familyEngine = new Map(
    (await source.query(`SELECT family, engine_key FROM hd_family_engine_map WHERE engine_key IS NOT NULL`)).rows.map(
      (r) => [r.family, r.engine_key]
    )
  );

  // From 1991 the H-D Sportster books (service portal + hd_oem_catalog_reference) code the
  // bikes XL883, XL883HUG, XL883DLX, XL1200, XL1200C, XL883C; the picker carries XLH-prefixed
  // twins (XLH883HUG "SPORTSTER 883 HUGGER") that no book names and that have no fitment.
  // Measured 2026-10-24: every 1991-2004 XLH* vehicle 0 rows, its XL twin 3-770 book
  // mentions a year. So from 1991 an XLH code becomes its XL twin (picker name kept); the
  // twin still needs its own evidence, and the old XLH key is retired on --apply. Plain
  // "XLH" becomes "XL", the family label, which is rejected.
  const xlhRenamed = [];
  for (const r of rows)
    if (r.family === 'Sportster' && r.year >= 1991 && /^XLH/.test(r.code)) {
      xlhRenamed.push({ year: r.year, code: r.code, model_name: r.model_name });
      r.code = 'XL' + r.code.slice(3);
    }
  const pickerCodes = new Set(rows.map((r) => r.code));
  const ev = await loadEvidence([...pickerCodes]);

  // The K series (K, KH, KR, ...) sits in the Sportster family with
  // filter_group VINTAGE; it's the flathead predecessor, not a Sportster.
  for (const r of rows) if (r.family === 'Sportster' && r.filter_group === 'VINTAGE') r.family = 'Flathead';
  // The picker files FXDRS under Dyna as "LOW RIDER S". It's the FXDR 114
  // Softail: its 2019 parts catalog reads "YV=FXDRS FXDR114" and the 2020
  // Softail catalog lists FXDRS with FXBRS/FXFB. (Low Rider S is FXLRS.)
  for (const r of rows)
    if (r.code === 'FXDRS' && r.family === 'Dyna') { r.family = 'Softail'; r.model_name = 'FXDR 114'; }
  // Before 1986, FXS and FXSB are Shovelhead FX-family bikes: the 1971-84 FX
  // Parts Catalog lists them with FX, FXE, FXEF ("72 to 79 - FX, FXE, FXS, FXEF;
  // 80 to * - FXB, FXSB"); the Softail chassis came in 1984. The picker files
  // them under Softail with the codes' later names (2011 "Blackline", 2013
  // "Breakout"). No source names the early bikes, so the name is left empty
  // and the app shows the code.
  for (const r of rows)
    if ((r.code === 'FXS' || r.code === 'FXSB') && r.year < 1986 && r.family === 'Softail') { r.family = 'Shovelhead'; r.model_name = null; }

  // Documented model-years the picker lacks (DOC_YEARS above).
  const pickerKeys = new Set(rows.map((r) => `${r.year}|${r.code}`));
  for (const k of DOC_YEARS.keys())
    if (!pickerKeys.has(k)) {
      const [y, code] = k.split('|');
      rows.push({ year: Number(y), model_id: null, code, model_name: null, family: docFamily(code), filter_group: 'DOC' });
    }

  const inRange = rows.filter((r) => r.year >= VEHICLES_YEAR_MIN && r.year <= VEHICLES_YEAR_MAX);
  const outOfRange = rows.length - inRange.length;

  const groups = new Map(); // (year, code) -> picker rows, model_id order
  for (const r of inRange) {
    const k = `${r.year}|${r.code}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const vehicles = [];
  const review = [];
  const resolvedConflicts = [];
  let sameFamilyDupes = 0;

  for (const [k, g] of groups) {
    const { year, code } = g[0];
    const textOk = !FAMILY_TOKENS.has(code);
    const families = [...new Set(g.map((r) => r.family))];
    // Range evidence is for Big Twins only: the picker pads Sportster/K years
    // (XLH back to 1936) and the 1954-78 XL books' "54 to *" ranges would
    // confirm XLH in 1954-56, before the Sportster existed.
    const rangeOk = !families.some((f) => f === 'Sportster' || f === 'Flathead');
    const evidence = {
      master: ev.master.has(k),
      oem_fitment: textOk && ev.fitment.has(k),
      reference: textOk && ev.reference.has(k),
      service_catalog: textOk && ev.service.has(k),
      catalog_range: rangeOk && ev.range.has(k),
      xl_book: families.includes('Sportster') && !!XL_BOOK[code] && year >= XL_BOOK[code][0] && year <= XL_BOOK[code][1],
      model_table: DOC_YEARS.has(k),
    };
    const reject = (reason) =>
      review.push({ reason, year, code, model_name: g[0].model_name, families: families.join('+'), ...evidence });

    if (code === 'XL' && families.includes('Sportster') && (year < XL_MODEL_YEARS[0] || year > XL_MODEL_YEARS[1])) {
      reject('xl_family_label');
      continue;
    }
    if (families.includes('Sportster') && NOT_EVO_XL(year, code)) {
      reject('not_in_xlh_vin_table');
      continue;
    }

    if (!Object.values(evidence).some(Boolean)) {
      reject(textOk && ev.span.has(k) ? 'catalog_span_only' : 'no_catalog_evidence');
      continue;
    }

    const unknown = families.filter((f) => !PLATFORM[f] && !VINTAGE.has(f));
    if (unknown.length) { reject(`unmapped_family:${unknown.join('+')}`); continue; }

    const platformFams = families.filter((f) => PLATFORM[f]);
    const eraFams = families.filter((f) => VINTAGE.has(f));
    if (eraFams.length > 1) { reject('multiple_engine_era_families'); continue; }

    const chassis = chassisPlatform(year, code);
    let platform;
    if (chassis) platform = chassis;
    else if (platformFams.length === 0) platform = 'vintage';
    else if (platformFams.length === 1) platform = PLATFORM[platformFams[0]];
    else {
      platform = resolvePlatformConflict(year, code, new Set(platformFams.map((f) => PLATFORM[f])));
      if (!platform) { reject('platform_conflict'); continue; }
    }
    if (families.length > 1) resolvedConflicts.push(`${year} ${code}: ${families.join('+')} -> ${platform}`);
    else if (g.length > 1) sameFamilyDupes++;

    // Name: the era family's row when present (platform families reuse one
    // name across eras, e.g. FL "ELECTRA GLIDE" for 1950); else lowest model_id
    // in the chosen platform's family.
    // FL/FX chassis engines come from the platform's engine list: the picker's
    // era family (Shovelhead) doesn't cover the 1985-86 Evo FX bikes.
    const eraFamily = eraFams[0] ?? null;
    const engine = engineFor(platform, year, chassis ? null : eraFamily, engines, familyEngine);
    if (eraFamily && !chassis && !engine) { reject('outside_engine_era'); continue; }
    // Era-family names count only inside that era (the picker files 1978-82 FLH
    // under Panhead as "PANHEAD HIGH COMPRESSION").
    const eraEngine = eraFamily && engines.get(familyEngine.get(eraFamily));
    const inEra = !eraEngine || (year >= eraEngine.year_start && year <= (eraEngine.year_end ?? 9999));
    const nameRow =
      (inEra ? g.find((r) => r.family === eraFamily) : null) ??
      g.find((r) => PLATFORM[r.family] === platform) ??
      g[0];
    // Early FXS/FXSB carry the codes' later Softail names (Blackline, Breakout).
    const modelName =
      (chassis === 'fx' && (code === 'FXS' || code === 'FXSB')) || (code === 'XLH' && year < 1972) ? null : nameRow.model_name;

    vehicles.push({
      year,
      model_code: code,
      model_name: modelName,
      platform,
      engine,
      fuel_system: code.endsWith('I') && pickerCodes.has(code.slice(0, -1)) ? 'efi' : 'unknown',
      evidence,
    });
  }

  for (const x of xlhRenamed) review.push({ reason: 'xlh_renamed_to_xl', year: x.year, code: x.code, model_name: x.model_name, families: 'Sportster' });

  // Master rows the picker doesn't have: listed, not loaded.
  const masterOnly = ev.masterRows.filter(
    (m) => m.year >= VEHICLES_YEAR_MIN && m.year <= VEHICLES_YEAR_MAX && !groups.has(`${m.year}|${m.code}`)
  );
  for (const m of masterOnly)
    review.push({ reason: 'master_only', year: m.year, code: m.code, model_name: m.model_name, families: '', master: true, oem_fitment: ev.fitment.has(`${m.year}|${m.code}`), reference: ev.reference.has(`${m.year}|${m.code}`) });

  // Live vehicles vs this run: added, changed, retired (deleted on --apply).
  // Rows in the DB that this run doesn't propose are otherwise left alone.
  const live = (
    await app.query(
      `SELECT v.vehicle_id, v.year, v.model_code, v.model_name, v.platform, v.engine, v.fuel_system,
              (SELECT count(*) FROM fitment f WHERE f.vehicle_id = v.vehicle_id)::int AS fitment
       FROM vehicles v`
    )
  ).rows;
  const liveBy = new Map(live.map((v) => [`${v.year}|${v.model_code}`, v]));
  const proposed = new Set(vehicles.map((v) => `${v.year}|${v.model_code}`));
  const added = vehicles.filter((v) => !liveBy.has(`${v.year}|${v.model_code}`));
  const changed = [];
  for (const v of vehicles) {
    const l = liveBy.get(`${v.year}|${v.model_code}`);
    if (!l) continue;
    const diffs = ['model_name', 'platform', 'engine', 'fuel_system'].filter((c) => (l[c] ?? null) !== (v[c] ?? null)).map((c) => `${c} ${l[c] ?? 'NULL'} -> ${v[c] ?? 'NULL'}`);
    if (diffs.length) changed.push(`${v.year} ${v.model_code}: ${diffs.join(', ')}`);
  }
  const retireKeys = new Set(review.filter((r) => ['xl_family_label', 'not_in_xlh_vin_table', 'xlh_renamed_to_xl'].includes(r.reason)).map((r) => `${r.year}|${r.code}`));
  const retired = live.filter((v) => retireKeys.has(`${v.year}|${v.model_code}`) && !proposed.has(`${v.year}|${v.model_code}`));

  // ---- report ----
  const count =(xs, fn) => xs.reduce((acc, x) => ((acc[fn(x)] = (acc[fn(x)] || 0) + 1), acc), {});
  const fmt = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${k}: ${n}`);
  const total = vehicles.length;
  const withEngine = vehicles.filter((v) => v.engine).length;
  const efi = vehicles.filter((v) => v.fuel_system === 'efi');
  const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;

  const lines = [];
  lines.push(`01_vehicles.mjs — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  lines.push(`Source rows (harley_model_years x harley_models x harley_families): ${rows.length}`);
  lines.push(`Excluded, year outside ${VEHICLES_YEAR_MIN}-${VEHICLES_YEAR_MAX}: ${outOfRange}`);
  lines.push(`Distinct (year, model_code) in range: ${groups.size}`);
  lines.push(`  same-family duplicates collapsed: ${sameFamilyDupes}`);
  lines.push(`  cross-family conflicts resolved: ${resolvedConflicts.length}`);
  lines.push(`Final vehicle rows: ${total}`);
  lines.push(`Review rows (not loaded): ${review.length}`);
  lines.push(...fmt(count(review, (r) => r.reason)));
  lines.push('');
  lines.push('Evidence for loaded rows:');
  lines.push(`  hd_year_model_master: ${vehicles.filter((v) => v.evidence.master).length}`);
  lines.push(`  oem_fitment model_codes: ${vehicles.filter((v) => v.evidence.oem_fitment).length}`);
  lines.push(`  reference used_on/vehicle_model: ${vehicles.filter((v) => v.evidence.reference).length}`);
  lines.push(`  service-portal catalogs (lib/servicecatalog.mjs): ${vehicles.filter((v) => v.evidence.service_catalog).length}`);
  const svcOnly = vehicles.filter((v) => v.evidence.service_catalog && !v.evidence.master && !v.evidence.oem_fitment && !v.evidence.reference);
  lines.push(`  service-portal catalogs ONLY (new because of that source): ${svcOnly.length}`);
  const svcBy = {};
  for (const v of svcOnly) (svcBy[v.platform] ||= []).push(`${v.model_code} ${v.year}`);
  for (const [pl, xs] of Object.entries(svcBy).sort((a, b) => b[1].length - a[1].length))
    lines.push(`    ${pl.padEnd(15)} ${String(xs.length).padStart(4)}  ${xs.slice(0, 10).join(', ')}${xs.length > 10 ? ' …' : ''}`);
  lines.push(`  pre-1985 catalog ranges: ${vehicles.filter((v) => v.evidence.catalog_range).length}`);
  const rangeOnly = vehicles.filter((v) => Object.entries(v.evidence).every(([k, b]) => k === 'catalog_range' || !b));
  lines.push(`  pre-1985 catalog ranges ONLY (new because of that rule): ${rangeOnly.length}`);
  const rangeBy = {};
  for (const v of rangeOnly) (rangeBy[`${v.model_code} (${v.model_name}) ${v.platform}/${v.engine ?? '-'}`] ||= []).push(v.year);
  for (const [k, ys] of Object.entries(rangeBy).sort())
    lines.push(`    ${k.padEnd(48)} ${Math.min(...ys)}-${Math.max(...ys)} (${ys.length})`);
  lines.push(`  catalog only (not in master): ${vehicles.filter((v) => !v.evidence.master).length}`);
  lines.push('');
  lines.push(`Engine resolved: ${withEngine} (${pct(withEngine, total)}); null: ${total - withEngine}`);
  lines.push('Engine null by platform/year bucket:');
  lines.push(...fmt(count(vehicles.filter((v) => !v.engine), (v) => `${v.platform} ${Math.floor(v.year / 10) * 10}s`)));
  lines.push('');
  lines.push(`fuel_system efi: ${efi.length} rows, ${new Set(efi.map((v) => v.model_code)).size} codes (${[...new Set(efi.map((v) => v.model_code))].sort().join(', ')})`);
  lines.push('');
  lines.push('By platform:');
  lines.push(...fmt(count(vehicles, (v) => v.platform)));
  lines.push('By engine:');
  lines.push(...fmt(count(vehicles, (v) => v.engine ?? 'NULL')));
  lines.push('');
  // Runs of consecutive years per code, for a readable diff.
  const runs = (xs) => {
    const by = {};
    for (const x of xs) (by[x.key] ||= []).push(x.year);
    return Object.entries(by).sort().map(([k, ys]) => {
      ys.sort((a, b) => a - b);
      const parts = [];
      for (let i = 0; i < ys.length; i++) {
        let j = i;
        while (j + 1 < ys.length && ys[j + 1] === ys[j] + 1) j++;
        parts.push(i === j ? `${ys[i]}` : `${ys[i]}-${ys[j]}`);
        i = j;
      }
      return `  ${k.padEnd(52)} ${parts.join(', ')}`;
    });
  };
  lines.push(`Diff vs vehicles table: ${added.length} added, ${changed.length} changed, ${retired.length} retired`);
  lines.push('Added:');
  lines.push(...runs(added.map((v) => ({ key: `${v.model_code} (${v.model_name ?? '-'}) ${v.platform}/${v.engine ?? '-'}`, year: v.year }))));
  lines.push('Changed:');
  lines.push(...changed.map((s) => `  ${s}`));
  lines.push(`Retired (deleted on --apply with their ${retired.reduce((n, v) => n + v.fitment, 0)} fitment rows):`);
  lines.push(...runs(retired.map((v) => ({ key: `${v.model_code} (${v.model_name ?? '-'}) ${v.platform}`, year: v.year }))));
  lines.push('');
  lines.push('Cross-family conflicts resolved:');
  lines.push(...(resolvedConflicts.length ? resolvedConflicts.map((s) => `  ${s}`) : ['  none']));
  lines.push('');
  lines.push('Sample (20 rows, evenly spaced by year):');
  const step = Math.max(1, Math.floor(total / 20));
  for (const v of vehicles.filter((_, i) => i % step === 0).slice(0, 20)) {
    const src = Object.entries(v.evidence).filter(([, b]) => b).map(([s]) => s).join('+');
    lines.push(`  ${v.year} ${v.model_code} (${v.model_name}) platform=${v.platform} engine=${v.engine ?? 'NULL'} fuel=${v.fuel_system} evidence=${src}`);
  }

  const ts = timestamp();
  const reportPath = path.join('reports', `01_vehicles_${ts}.txt`);
  const reviewPath = path.join('reports', `01_vehicles_review_${ts}.csv`);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n') + '\n');
  fs.writeFileSync(
    path.join('reports', `01_vehicles_${ts}.json`),
    JSON.stringify(vehicles.map(({ evidence, ...v }) => ({ ...v, evidence: Object.keys(evidence).filter((k) => evidence[k]) })))
  );
  const cols = ['reason', 'year', 'code', 'model_name', 'families', 'master', 'oem_fitment', 'reference', 'service_catalog', 'catalog_range', 'xl_book', 'model_table'];
  fs.writeFileSync(
    reviewPath,
    [cols.join(','), ...review.sort((a, b) => a.reason.localeCompare(b.reason) || a.code.localeCompare(b.code) || a.year - b.year).map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n'
  );
  console.log(lines.join('\n'));
  console.log(`\nReport written to ${reportPath}`);
  console.log(`Review rows written to ${reviewPath}`);
  console.log(`Proposed vehicles written to reports/01_vehicles_${ts}.json (03 --vehicles-from previews their fitment)`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write to APP_DATABASE_URL.');
    return;
  }

  const client = await app.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `INSERT INTO vehicles (year, model_code, model_name, platform, engine, fuel_system)
       SELECT * FROM unnest($1::smallint[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
       ON CONFLICT (year, model_code) DO UPDATE
         SET model_name = EXCLUDED.model_name, platform = EXCLUDED.platform,
             engine = EXCLUDED.engine, fuel_system = EXCLUDED.fuel_system`,
      [
        vehicles.map((v) => v.year),
        vehicles.map((v) => v.model_code),
        vehicles.map((v) => v.model_name),
        vehicles.map((v) => v.platform),
        vehicles.map((v) => v.engine),
        vehicles.map((v) => v.fuel_system),
      ]
    );
    const ids = retired.map((v) => v.vehicle_id);
    const fit = await client.query(`DELETE FROM fitment WHERE vehicle_id = ANY($1)`, [ids]);
    await client.query(`DELETE FROM fitment_hidden WHERE vehicle_id = ANY($1)`, [ids]);
    const del = await client.query(`DELETE FROM vehicles WHERE vehicle_id = ANY($1)`, [ids]);
    await client.query('COMMIT');
    console.log(`Upserted ${res.rowCount} vehicles. Retired ${del.rowCount} vehicles and ${fit.rowCount} fitment rows.`);
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
