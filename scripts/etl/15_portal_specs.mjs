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

// VIN position 4 block -> [{ letter, text, ci, cc, fuel, key }]
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
    const ci = nameNum && Number(nameNum) < 200 ? Number(nameNum) : Number.isFinite(cc) ? Math.round((cc / 16.387) * 10) / 10 : null;
    const fuel = /carbureted/i.test(t) ? 'carb' : /fuel[- ]injected|\bEFI\b/i.test(t) ? 'efi' : null;
    // Token to find this engine's sections: "TWIN CAM 103", "883", "114", "REVOLUTION".
    const key = /twin cam\s*\d+/i.exec(t)?.[0].toUpperCase().replace(/\s+/g, ' ') ?? (nameNum ? nameNum : Number.isFinite(cc) ? String(cc) : /revolution/i.test(t) ? 'REVOLUTION' : null);
    out.push({ letter: m[1], text: t, ci, cc: Number.isFinite(cc) ? cc : null, fuel, key });
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
  const st = { books: 0, withEngine: 0, evo: 0, noEngine: [], unresolvedModels: 0 };
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
      sized = [{ letter: '-', text: 'V2 Evolution (80 ci, hd_engine_types)', ci: 80, cc: 1340, fuel: null, key: null }];
      evoBook = true;
      st.evo++;
    }
    if (!sized.length) { st.noEngine.push(m.slug); continue; }
    st.withEngine++;
    // Distinct sizes (88 and 88B are the same size).
    const bySize = new Map();
    for (const e of sized) { const k = e.cc ?? `${e.ci}ci`; if (!bySize.has(k)) bySize.set(k, e); }
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
        for (const k of sizes) {
          const e = bySize.get(k);
          const ok = `${e.ci ?? ''}|${e.cc ?? ''}|${gears.get(c) ?? ''}`;
          if (!opts.has(ok)) opts.set(ok, { v, ci: e.ci ?? (e.cc ? Math.round((e.cc / 16.387) * 10) / 10 : null), cc: e.cc, speeds: gears.get(c) ?? null, fuel: e.fuel, engine: e.text, source: evoBook ? `portal:${m.slug}+hd_engine_types` : `portal:${m.slug}` });
        }
      }
    }
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
  L.push('');
  L.push('Sample:');
  for (const r of rowsOut.filter((_, i) => i % Math.max(1, Math.floor(rowsOut.length / 30)) === 0).slice(0, 30))
    L.push(`  ${r.v.year} ${r.v.model_code.padEnd(9)} ${String(r.ci ?? '-').padStart(5)} ci ${String(r.cc ?? '-').padStart(5)} cc ${r.speeds ? r.speeds + '-speed' : 'trans ?'}  ${r.engine.slice(0, 40)}  [${r.source}]`);
  fs.mkdirSync('reports', { recursive: true });
  const rp = path.join('reports', `15_portal_specs_${ts}.txt`);
  fs.writeFileSync(rp, L.join('\n') + '\n');
  const cols = ['year', 'model_code', 'ci', 'cc', 'speeds', 'fuel', 'engine', 'source'];
  fs.writeFileSync(rp.replace('.txt', '.csv'), [cols.join(','), ...rowsOut.map((r) => [r.v.year, r.v.model_code, r.ci, r.cc, r.speeds, r.fuel, r.engine, r.source].map(csvCell).join(','))].join('\n') + '\n');
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
