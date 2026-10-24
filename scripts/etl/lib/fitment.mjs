// scripts/etl/lib/fitment.mjs
//
// Catalog row -> (part, vehicles) targeting, shared by 03_fitment (loads the
// rows) and 04_conditions (tags the same rows). See 03_fitment.mjs for the rules.

import { makeResolver, normalize, yearsOk } from './parts.mjs';
import { parseUsedOn } from './usedon.mjs';

const DOC_SCOPE_MIN = 2;

// Police models. Civilian catalogs never list these codes (0 rows in the
// 1995-2004 touring books); H-D catalogs them in separate police books. A
// family row ("FLT: 95*-ALL") reaching one is right for shared mechanical parts
// but wrong for police equipment (1995 police book: 566 of 783 such pairs
// listed; mirrors, wheels, reflectors differ), so those pairs are low.
export const POLICE_CODE = /^(FLHP|FLHPI|FLHPE|FLHPEI|FLHTP|FLHTPI|FLTRXP|FXRP|FXDP|FXDBP)$/;

export const span = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

// rows: hd_oem_catalog_reference { id, part_number, description, used_on_raw, year_start, year_end, doc }
// fitmentSrc: oem_fitment { display, year_start, year_end }
// vehicles: { vehicle_id, year, model_code, platform }; parts: Set of oem_number
export function makeTargeter({ rows, fitmentSrc, vehicles, parts }) {
  const { resolve } = makeResolver(rows, fitmentSrc);

  // oem_fitment number+year, for "high" confidence.
  const corroborated = new Set();
  for (const r of fitmentSrc) {
    if (!yearsOk(r) || (r.year_end ?? r.year_start) - r.year_start > 15) continue;
    const key = normalize(resolve({ part_number: r.display, year_start: r.year_start, year_end: r.year_end }).final ?? r.display);
    for (const y of span(r.year_start, r.year_end ?? r.year_start)) corroborated.add(`${key}|${y}`);
  }

  const byCode = new Map(); // code -> Map(year -> vehicle)
  const byPlatform = new Map(); // platform -> vehicles
  for (const v of vehicles) {
    if (!byCode.has(v.model_code)) byCode.set(v.model_code, new Map());
    byCode.get(v.model_code).set(v.year, v);
    if (!byPlatform.has(v.platform)) byPlatform.set(v.platform, []);
    byPlatform.get(v.platform).push(v);
  }
  const codeOf = (item) => item.alts.find((c) => byCode.has(c)) ?? null;

  // Document scope for ALL rows: codes listed explicitly in >= DOC_SCOPE_MIN rows of the doc.
  const parsed = rows.map((r) => parseUsedOn(r.used_on_raw));
  const docCodeRows = new Map();
  rows.forEach((r, i) => {
    const p = parsed[i];
    if (!p.items) return;
    let m = docCodeRows.get(r.doc);
    if (!m) docCodeRows.set(r.doc, (m = new Map()));
    for (const c of new Set(p.items.map(codeOf).filter(Boolean))) m.set(c, (m.get(c) || 0) + 1);
  });
  const docScope = new Map();
  for (const [doc, m] of docCodeRows) docScope.set(doc, [...m].filter(([, n]) => n >= DOC_SCOPE_MIN).map(([c]) => c));

  // One catalog row -> { status, kind, oem?, res?, targets: [[vehicle, low]], missing, notes }.
  // status: ok | part_unresolved | part_not_loaded | bad_year | unparsed | no_vehicle
  // notes: [reason, detail] pairs worth a review line even when status is ok.
  function target(r, i) {
    const p = parsed[i];
    const out = { status: 'ok', kind: p.kind, targets: [], missing: [], notes: [] };
    const res = resolve(r);
    if (!res.final) return { ...out, status: 'part_unresolved' };
    const oem = normalize(res.final);
    if (!parts.has(oem)) return { ...out, status: 'part_not_loaded' };
    if (!yearsOk(r)) return { ...out, status: 'bad_year', reason: `${r.year_start}-${r.year_end}` };
    if (p.kind === 'unparsed') return { ...out, status: 'unparsed', reason: p.reason };

    const ys = r.year_start;
    const ye = r.year_end ?? r.year_start;
    const targets = out.targets;
    const fromCodes = (items, years) => {
      for (const item of items) {
        const code = codeOf(item);
        if (!code) { out.missing.push(item.code); continue; }
        for (const y of item.year ? [item.year] : years) {
          const v = byCode.get(code).get(y);
          if (v) targets.push([v, false]);
        }
      }
    };
    const fromScope = (years) => {
      const scope = docScope.get(r.doc) || [];
      if (!scope.length) { out.notes.push(['all_without_doc_scope', '']); return; }
      for (const c of scope) for (const y of years) { const v = byCode.get(c).get(y); if (v) targets.push([v, false]); }
    };

    if (p.kind === 'codes') {
      fromCodes(p.items, span(ys, ye));
      if (p.bad.length) out.notes.push(['bad_code_token', p.bad.join(' | ').slice(0, 60)]);
    } else if (p.kind === 'all') {
      fromScope(span(ys, ye));
    } else if (p.kind === 'family') {
      const years = new Set(p.open ? span(Math.max(p.from, ys), ye) : [p.from]);
      for (const v of byPlatform.get(p.platform) || []) if (years.has(v.year)) targets.push([v, POLICE_CODE.test(v.model_code)]);
    } else if (p.kind === 'range') {
      const years = span(p.from, p.to ?? ye);
      const before = targets.length;
      if (p.all) fromScope(years);
      else fromCodes(p.items, years);
      for (let k = before; k < targets.length; k++) targets[k][1] = p.lowYears.includes(targets[k][0].year);
    }
    return { ...out, status: targets.length ? 'ok' : 'no_vehicle', oem, res };
  }

  // confidence: low if repaired from another year, a boundary year, or a family
  // row reaching a police model; high if read as-is and oem_fitment has it in a
  // catalog covering that year; else medium.
  function confidence(oem, res, vehicle, low) {
    if (res.numberSource === 'repaired_other_year' || low) return 'low';
    return res.numberSource === 'extracted' && corroborated.has(`${oem}|${vehicle.year}`) ? 'high' : 'medium';
  }

  return { target, confidence, parsed, docScope, byCode };
}
