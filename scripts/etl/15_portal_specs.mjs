// scripts/etl/15_portal_specs.mjs
//
// Engine size, fuel system and transmission speeds per vehicle from the H-D
// service-portal parts catalogs (catalog-extract/html + rows, 1991-2027; DATA_RIGHTS
// service-portal row: facts only). Writes vehicle_specs rows (migration 006) with
// source 'portal:<book slug>'; 12_vehicle_specs keeps the pre-1985 H-D tables.
//
// Per book:
//   Engine: the VIN breakdown at the front of every book, position 4 "Engine type":
//     "4=Twin Cam 96, 1584 cc air cooled, fuel injected", "M=883cc", "Y=Twin Cam 88B
//     carbureted", "M=Twin Cam 103, 1690 cm3". Size = the printed cc/cm3, else the
//     cubic inches in the engine's name (Twin Cam 88 -> 88 ci). "carbureted" /
//     "fuel injected" -> fuel note.
//   Which model has which engine: one size in the book -> every model in it. Several
//     -> the models listed in rows under sections naming that engine ("CYLINDERS,
//     HEADS & VALVES - TWIN CAM 110", "... 883"); a model under none stays empty.
//   A model code that carries one of the book's sizes (XLH883, XL1200C) takes that one.
//   Evolution big-twin books (1991-99) print no size: VIN engine type is only "L=Carbureted /
//     R=Fuel Injected". Their models are already engine 'evolution_bigtwin' (01, from the
//     source hd_engine_types row: 1984-1999, 80 ci); a model of such a book listed under
//     V2 EVOLUTION engine sections gets 80 ci / 1340 cc, source 'portal:<book>+hd_engine_types'.
//   Transmission: only when a TRANSMISSION/GEAR row for that model names a 6th gear (6th,
//     sixth, 5th/6th) -> 6-speed. The lists name 5th gears in 6-speed boxes too, so a
//     5th gear proves nothing: no 6th named -> transmission left empty.
//   Fuel (carbureted / injected) is not recorded: books list both for one size.
// Vehicles never change here; a book's model is matched to our vehicles by code + year.
//
// --apply replaces every vehicle_specs row whose source starts with 'portal:'.
//
// Usage:
//   node scripts/etl/15_portal_specs.mjs            (dry run, reports/15_portal_specs_<ts>.txt + .csv)
//   node scripts/etl/15_portal_specs.mjs --apply

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG_EXTRACT_DIR as DIR, available } from './lib/servicecatalog.mjs';

const APPLY = process.argv.includes('--apply');
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });
const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const textLines = (h) =>
  h.replace(/<[^>]+>/g, '\n').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .split('\n').map((l) => l.trim()).filter(Boolean);

// Cooling as the VIN table prints it; key = the section-title test for the models that have it.
const COOLING = [
  ['twin', /twin[- ]cooled/i, 'Twin-Cooled'], ['center', /center[- ]cooled/i, 'Center-Cooled'],
  ['precision', /precision[- ]cooled/i, 'Precision-Cooled'], ['liquid', /liquid[- ]cooled/i, 'Liquid-Cooled'],
  ['air', /air[- ]cooled/i, 'Air-Cooled'],
];
const SECTION_TAG = { twin: /TWIN[- ]COOLED/i, center: /CENTER[- ]COOLED/i, precision: /PRECISION[- ]COOLED/i, liquid: /LIQUID[- ]COOLED/i, air: /AIR[- ]COOLED/i, vvt: /\bVVT\b/i, ho: /HIGH OUTPUT|\bH\.O\./i };
// Twin Cam size by cc when the VIN table prints only "1450cc" (2005-07 books).
const TWIN_CAM_CC = [[1450, 88], [1550, 95], [1584, 96], [1585, 96], [1690, 103], [1800, 110], [1801, 110], [1802, 110], [1803, 110]];

// Engine name for a vehicle: "Twin Cam 96B", "Twin-Cooled Milwaukee-Eight 114", "Evolution 1200".
// Twin Cam B = Softail (counterbalanced), A = Touring / Dyna / Trike (Laken; every Softail
// book prints B or "balanced", no other book does).
function engineName(e, v) {
  const t = e.text;
  const n = (re) => re.exec(t)?.[1];
  let name;
  if (e.evo) name = 'Evolution 1340';
  else if (/screamin' eagle/i.test(t)) name = `Screamin' Eagle Milwaukee-Eight ${n(/eight[- ]?(?:vvt)?\s*(\d{3})/i)}`;
  else if (/milwaukee[- ]eight/i.test(t)) name = `Milwaukee-Eight ${e.vvt ? 'VVT ' : ''}${n(/eight[- ]?(?:vvt)?\s*(\d{3})/i)}`;
  else if (v.engine === 'twin_cam') {
    const num = n(/twin cam\s*(\d+)/i) ?? (e.ci && e.ci < 200 && /cu\. ?in|in 3/i.test(t) ? String(Math.round(e.ci)) : null) ?? String(TWIN_CAM_CC.find(([c]) => c === e.cc)?.[1] ?? '');
    name = num ? `Twin Cam ${num}${v.platform === 'softail' ? 'B' : 'A'}` : null;
  } else if (/revolution max/i.test(t)) name = `Revolution Max ${({ 1252: '1250' })[n(/max\s*(\d+T?)/i)] ?? n(/max\s*(\d+T?)/i)}`;
  else if (/revolution x/i.test(t)) name = `Revolution X ${n(/(\d{3})\s*cm/i)}`;
  else if (/revolution|vrsc/i.test(t) || v.engine === 'revolution') name = 'Revolution';
  else if (v.engine === 'evolution_sportster') name = `Evolution ${e.cc && e.cc < 1000 ? 883 : 1200}`;
  else name = n(/^(QJ\w+)/) ?? null;
  return name ? [e.ho ? 'High Output' : null, name].filter(Boolean).join(' ') : null;
}

// VIN position 4 block -> [{ letter, text, ci, cc, fuel, key, cool, ho, vvt }]
function engineTypes(lines) {
  const i = lines.slice(0, 4000).indexOf('Engine type');
  if (i === -1) return [];
  const block = [];
  for (let k = i + 1; k < i + 60 && k < lines.length; k++) {
    // Next VIN position: a lone digit followed by its heading. A lone "3" is also the
    // superscript of "cm3", so the digit alone doesn't end the block.
    const HEAD = /^(Introduction|Calibration|Configuration|VIN check|Model year|Assembly|Sequential)/i;
    if (HEAD.test(lines[k]) || (/^\d$/.test(lines[k]) && HEAD.test(lines[k + 1] ?? ''))) break;
    block.push(lines[k]);
  }
  const text = block.join(' ').replace(/\s*™\s*/g, ' ').replace(/\s*®\s*/g, ' ').replace(/\s+/g, ' ');
  const out = [];
  for (const m of text.matchAll(/(?:^|\s)([0-9A-Z])\s*=\s*(.+?)(?=\s[0-9A-Z]\s*=|$)/g)) {
    const t = m[2].trim().replace(/[,;]\s*$/, '');
    const cc = Number(/(\d{3,4})\s*(?:cc|cm)/i.exec(t)?.[1] ?? NaN);
    // Cubic inches only from names that carry them (Twin Cam 88B, Milwaukee-Eight 114,
    // Screamin' Eagle 131); "Evolution 883" / "Revolution X 500" are cc. Else from cc.
    const nameNum = /(?:twin cam|milwaukee[- ]eight(?:\s*vvt)?|screamin' eagle(?:\s*milwaukee[- ]eight)?)\D{0,4}?(\d{2,3})(?!\d)/i.exec(t)?.[1];
    const printedCi = /(\d{2,3})\s*(?:cu\.\s*in|in\s*3)\b/i.exec(t)?.[1]; // "110 cu. in. (1800 cc)"
    const ci = nameNum && Number(nameNum) < 200 ? Number(nameNum) : printedCi ? Number(printedCi) : Number.isFinite(cc) ? Math.round((cc / 16.387) * 10) / 10 : null;
    const fuel = /carbureted/i.test(t) ? 'carb' : /fuel[- ]injected|\bEFI\b/i.test(t) ? 'efi' : null;
    // Token to find this engine's sections: "TWIN CAM 103", "883", "114", "REVOLUTION".
    const key = /twin cam\s*\d+/i.exec(t)?.[0].toUpperCase().replace(/\s+/g, ' ') ?? (nameNum ? nameNum : Number.isFinite(cc) ? String(cc) : /revolution/i.test(t) ? 'REVOLUTION' : null);
    const cool = COOLING.find(([, re]) => re.test(t))?.[0] ?? null;
    out.push({ letter: m[1], text: t, ci, cc: Number.isFinite(cc) ? cc : null, fuel, key, cool, ho: /high output|\bH\.O\./i.test(t), vvt: /\bVVT\b/i.test(t) });
  }
  return out;
}

async function main() {
  if (!available()) throw new Error(`no catalog extract at ${DIR}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  const vehicles = (await app.query('SELECT vehicle_id, year, model_code, platform, engine FROM vehicles')).rows;
  const vOf = new Map(vehicles.map((v) => [`${v.year}|${v.model_code}`, v]));
  const codes = new Set(vehicles.map((v) => v.model_code));

  const specs = new Map(); // vehicle_id -> Map(optionKey -> row)
  const st = { books: 0, withEngine: 0, evo: 0, noEngine: [], unresolvedModels: 0, coolUnresolved: 0, noName: [] };
  for (const m of Object.values(manifest)) {
    if (m.pdfOnly || !m.from) continue;
    const htmlFile = path.join(DIR, 'html', `${m.slug}.html`);
    const rowsFile = path.join(DIR, 'rows', `${m.slug}.tsv`);
    if (!fs.existsSync(htmlFile) || !fs.existsSync(rowsFile)) continue;
    st.books++;
    const engines = engineTypes(textLines(fs.readFileSync(htmlFile, 'utf8')));
    // rows: page | section | figure | index | part | description | models
    const rows = fs.readFileSync(rowsFile, 'utf8').split('\n').map((l) => l.split('\t')).filter((c) => c.length === 7);
    const modelsIn = (r) => new Set(r[6].toUpperCase().split(/[^A-Z0-9]+/).filter((t) => codes.has(t)));
    const bookModels = new Set(rows.flatMap((r) => [...modelsIn(r)]));
    const years = Array.from({ length: m.to - m.from + 1 }, (_, k) => m.from + k);

    // Engine sizes known for this book.
    let sized = engines.filter((e) => e.ci || e.cc);
    let evoBook = false;
    if (!sized.length && rows.some((r) => /EVOLUTION|V2|V²/i.test(r[1])) && !/sportster/i.test(m.slug)) {
      sized = [{ letter: '-', text: 'V2 Evolution (80 ci, hd_engine_types)', ci: 80, cc: 1340, fuel: null, key: null, cool: null, ho: false, vvt: false, evo: true }];
      evoBook = true;
      st.evo++;
    }
    if (!sized.length) { st.noEngine.push(m.slug); continue; }
    st.withEngine++;
    // Distinct sizes; each size keeps its variants (Twin-Cooled / Air-Cooled, VVT, High Output).
    // Carbureted / injected and balanced are not variants here (fuel isn't recorded; B is by platform).
    const bySize = new Map(); // sizeKey -> first entry
    const variants = new Map(); // sizeKey -> Map(variantKey -> entry)
    for (const e of sized) {
      const k = e.cc ?? `${e.ci}ci`;
      if (!bySize.has(k)) bySize.set(k, e);
      const vk = `${e.cool ?? ''}|${e.ho}|${e.vvt}`;
      const vm = variants.get(k) ?? variants.set(k, new Map()).get(k);
      if (!vm.has(vk)) vm.set(vk, e);
    }
    // Models listed under sections naming a cooling / VVT / H.O. variant.
    const tagModels = {};
    for (const [tag, re] of Object.entries(SECTION_TAG)) {
      tagModels[tag] = new Set();
      for (const r of rows) if (re.test(r[1])) for (const c of modelsIn(r)) tagModels[tag].add(c);
    }
    // A model's variants of one size: narrowed only by section evidence in this book.
    const pick = (c, k) => {
      let vs = [...variants.get(k).values()];
      const cools = [...new Set(vs.map((e) => e.cool))];
      if (cools.length > 1) {
        // Air-cooled is the base engine: a model gets Twin- / Center- / Precision-Cooled only when a
        // section with that word lists it ("FAIRING LOWERS - ULTRA - TWIN-COOLED: FLHTCU TC, FLHTK"),
        // and air-cooled when it's listed under an air-cooled section or under no special one.
        const special = cools.filter((x) => x && x !== 'air');
        if (special.every((x) => tagModels[x].size)) {
          const keep = new Set(special.filter((x) => tagModels[x].has(c)));
          if (cools.includes('air') && (!keep.size || tagModels.air.has(c))) keep.add('air');
          const nv = vs.filter((e) => !e.cool || keep.has(e.cool));
          if (nv.length) vs = nv;
        } else st.coolUnresolved++;
      }
      for (const tag of ['vvt', 'ho']) {
        if (new Set(vs.map((e) => e[tag])).size < 2 || !tagModels[tag].size) continue;
        vs = vs.filter((e) => e[tag] === tagModels[tag].has(c));
      }
      return vs;
    };
    const modelEngine = new Map(); // code -> Set(sizeKey)
    if (bySize.size === 1) for (const c of bookModels) modelEngine.set(c, new Set(bySize.keys()));
    else {
      // A size written into the model code (XLH883, XL1200C) picks that engine.
      // H-D prints the 1200 as "1202 cm3": allow a few cc.
      for (const c of bookModels) {
        const n = Number(/(\d{3,4})/.exec(c)?.[1] ?? NaN);
        if (!Number.isFinite(n)) continue;
        for (const [k, e] of bySize) if (e.cc && Math.abs(e.cc - n) <= 10) (modelEngine.get(c) ?? modelEngine.set(c, new Set()).get(c)).add(k);
      }
      for (const [k, e] of bySize) {
        const tok = e.key && new RegExp(`\\b${e.key.replace(/\s+/g, '\\s*')}\\b`, 'i');
        if (!tok) continue;
        for (const r of rows) if (tok.test(r[1])) for (const c of modelsIn(r)) if (!modelEngine.get(c)?.size || [...modelEngine.get(c)].includes(k)) (modelEngine.get(c) ?? modelEngine.set(c, new Set()).get(c)).add(k);
      }
    }
    // Transmission per model.
    const gears = new Map(); // code -> 5|6
    for (const r of rows) {
      if (!/TRANSMISSION|GEAR/i.test(r[1])) continue;
      const d = r[5];
      const g = /\b(6th|sixth)\b|5th\/6th|fifth\/sixth/i.test(d) ? 6 : 0;
      if (!g) continue;
      for (const c of modelsIn(r)) gears.set(c, Math.max(gears.get(c) ?? 0, g));
    }
    for (const c of bookModels) {
      const sizes = modelEngine.get(c);
      if (!sizes?.size) { st.unresolvedModels++; continue; }
      for (const y of years) {
        const v = vOf.get(`${y}|${c}`);
        if (!v) continue;
        if (evoBook && v.engine !== 'evolution_bigtwin') continue;
        const opts = specs.get(v.vehicle_id) ?? specs.set(v.vehicle_id, new Map()).get(v.vehicle_id);
        for (const k of sizes) for (const e of pick(c, k)) {
          const name = engineName(e, v);
          const ok = `${name ?? `${e.ci ?? ''}|${e.cc ?? ''}`}|${e.cool ?? ''}|${gears.get(c) ?? ''}`;
          if (!opts.has(ok)) opts.set(ok, { v, ci: e.ci ?? (e.cc ? Math.round((e.cc / 16.387) * 10) / 10 : null), cc: e.cc, speeds: gears.get(c) ?? null, fuel: e.fuel, base: name, cool: e.cool, choice: new Set(variants.get(k) ? [...variants.get(k).values()].map((x) => x.cool) : []).size > 1, engine: e.text, source: evoBook ? `portal:${m.slug}+hd_engine_types` : `portal:${m.slug}` });
        }
      }
    }
  }

  // Cooling goes into the name only for a year + engine some book offers with a cooling choice
  // ("Twin-Cooled ... 114" vs "Air-Cooled ... 114"); elsewhere every big twin is air-cooled and
  // every Revolution liquid-cooled, so the word says nothing. Then one row per named engine
  // (books print 1584 or 1585 cc for the same Twin Cam 96).
  const choice = new Set();
  for (const m of specs.values()) for (const r of m.values()) if (r.choice && r.base) choice.add(`${r.v.year}|${r.base}`);
  for (const [id, m] of specs) {
    const out = new Map();
    for (const r of m.values()) {
      const word = choice.has(`${r.v.year}|${r.base}`) ? COOLING.find(([k]) => k === r.cool)?.[2] : null;
      r.name = r.base ? [word, r.base].filter(Boolean).join(' ') : null;
      const k = `${r.name ?? `${r.ci}|${r.cc}`}|${r.speeds ?? ''}`;
      if (!out.has(k)) out.set(k, r);
    }
    // A bare name next to the same engine with a cooling word is that engine from a book with no
    // choice; a row without gears next to the same engine with gears is the same bike.
    for (const [k, r] of out) {
      const others = [...out.values()].filter((o) => o !== r && o.base === r.base);
      if (r.base && others.some((o) => o.name !== r.base && r.name === r.base)) out.delete(k);
      else if (r.speeds == null && others.some((o) => o.name === r.name && o.speeds != null)) out.delete(k);
      // No name: the book's engine doesn't match the bike's generation (1998 police book prints the
      // 1999 Twin Cam 88; our 1998 FLHTPI is Evolution). Left out, counted.
      else if (!r.base) { out.delete(k); st.noName.push(`${r.v.year} ${r.v.model_code} "${r.engine}" [${r.source}]`); }
    }
    if (!out.size) specs.delete(id);
    else specs.set(id, out);
    continue;
  }
  const rowsOut = [...specs.values()].flatMap((m) => [...m.values()]);
  const L = [];
  L.push(`15_portal_specs — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${new Date().toISOString()}`);
  L.push(`Books read: ${st.books}; with an engine size: ${st.withEngine} (${st.evo} from Evolution sections + "1340"); without: ${st.noEngine.length}`);
  L.push(`Book models whose engine couldn't be placed (several engines, none of its sections named): ${st.unresolvedModels}`);
  L.push(`Vehicles with specs: ${specs.size} of ${vehicles.filter((v) => v.year >= 1991).length} (1991+); spec rows: ${rowsOut.length}; with transmission: ${rowsOut.filter((r) => r.speeds).length} (5-speed ${rowsOut.filter((r) => r.speeds === 5).length}, 6-speed ${rowsOut.filter((r) => r.speeds === 6).length})`);
  const byYear = {};
  for (const r of rowsOut) { const y = r.v.year; (byYear[y] ??= new Set()).add(r.v.vehicle_id); }
  const total = {};
  for (const v of vehicles) if (v.year >= 1991) total[v.year] = (total[v.year] ?? 0) + 1;
  L.push('Coverage by year (vehicles with specs / vehicles): ' + Object.keys(total).sort().map((y) => `${y}:${byYear[y]?.size ?? 0}/${total[y]}`).join(' '));
  L.push(`Books without an engine size: ${st.noEngine.slice(0, 40).join(', ')}${st.noEngine.length > 40 ? ' …' : ''}`);
  L.push(`Left out, engine doesn't match the bike's generation: ${st.noName.length}${st.noName.length ? ' — ' + st.noName.join('; ') : ''}`);
  L.push(`Models with two same-size cooling variants and no cooling section naming them (both kept): ${st.coolUnresolved}`);
  const names = {};
  for (const r of rowsOut) names[r.name ?? '(no name)'] = (names[r.name ?? '(no name)'] ?? 0) + 1;
  L.push('Engine names (spec rows): ' + Object.entries(names).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('; '));
  const two = [...specs.values()].filter((m) => new Set([...m.values()].map((r) => r.cc ?? r.ci)).size < m.size);
  L.push(`Vehicles with two engines of one size: ${two.length}` + (two.length ? ' — e.g. ' + two.slice(0, 12).map((m) => { const r = [...m.values()]; return `${r[0].v.year} ${r[0].v.model_code}: ${r.map((x) => x.name).join(' / ')}`; }).join('; ') : ''));
  L.push('');
  L.push('Sample:');
  for (const r of rowsOut.filter((_, i) => i % Math.max(1, Math.floor(rowsOut.length / 30)) === 0).slice(0, 30))
    L.push(`  ${r.v.year} ${r.v.model_code.padEnd(9)} ${String(r.ci ?? '-').padStart(5)} ci ${String(r.cc ?? '-').padStart(5)} cc ${r.speeds ? r.speeds + '-speed' : 'trans ?'}  ${(r.name ?? '(no name) ' + r.engine).slice(0, 48)}  [${r.source}]`);
  fs.mkdirSync('reports', { recursive: true });
  const rp = path.join('reports', `15_portal_specs_${ts}.txt`);
  fs.writeFileSync(rp, L.join('\n') + '\n');
  const cols = ['year', 'model_code', 'ci', 'cc', 'speeds', 'name', 'engine', 'source'];
  fs.writeFileSync(rp.replace('.txt', '.csv'), [cols.join(','), ...rowsOut.map((r) => [r.v.year, r.v.model_code, r.ci, r.cc, r.speeds, r.name, r.engine, r.source].map(csvCell).join(','))].join('\n') + '\n');
  console.log(L.join('\n'));
  console.log(`\n→ ${rp} (+ .csv).`);
  if (!APPLY) { console.log('Dry run: nothing written.'); return; }

  const client = await app.connect();
  try {
    await client.query('BEGIN');
    const del = await client.query(`DELETE FROM vehicle_specs WHERE source LIKE 'portal:%'`);
    const res = await client.query(
      `INSERT INTO vehicle_specs (vehicle_id, displacement_ci, displacement_cc, transmission_speeds, note, source, source_ref)
       SELECT * FROM unnest($1::int[], $2::numeric[], $3::smallint[], $4::smallint[], $5::text[], $6::text[], $7::text[])
       ON CONFLICT DO NOTHING`,
      [rowsOut.map((r) => r.v.vehicle_id), rowsOut.map((r) => r.ci), rowsOut.map((r) => r.cc), rowsOut.map((r) => r.speeds),
        rowsOut.map((r) => r.engine.replace(/,?\s*(carbureted|fuel[- ]injected|air[- ]cooled).*$/i, '').trim()),
        rowsOut.map((r) => r.source), rowsOut.map((r) => `${r.source.slice(7)}: VIN engine type / transmission gears`)]
    );
    await client.query('COMMIT');
    console.log(`Deleted ${del.rowCount}, inserted ${res.rowCount} portal vehicle_specs rows.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => app.end());
