import type { Span, Spec } from './api';
import { titleCase } from './bike';

// Condition tags (docs/SPEC.md "Conditions") as a rider would say them.
const CONDITION_LABEL: Record<string, string> = {
  carb: 'Carbureted',
  efi: 'Fuel injected',
  abs: 'ABS',
  non_abs: 'Non-ABS',
  cvo: 'CVO',
  california: 'California',
  non_california: '49-state',
  hdi: 'HDI / export',
  cable_clutch: 'Cable clutch',
  hydraulic_clutch: 'Hydraulic clutch',
  cast_wheel: 'Cast wheel',
  laced_wheel: 'Laced wheel',
};

export const conditionLabel = (tag: string) =>
  CONDITION_LABEL[tag] ?? tag.replace(/_/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase());

export const yearRange = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

// [{FLHR 2004-2005}, {FLHR 2007-2007}, {FLHT 2004-2006}] ->
// [{model: 'FLHR', years: '2004–2005, 2007'}, {model: 'FLHT', years: '2004–2006'}], input order kept.
export function byModel(spans: Span[]): { model: string; years: string }[] {
  const out = new Map<string, string[]>();
  for (const s of spans) {
    if (!out.has(s.model_code)) out.set(s.model_code, []);
    out.get(s.model_code)!.push(yearRange(s.year_start, s.year_end));
  }
  return [...out].map(([model, ys]) => ({ model, years: ys.join(', ') }));
}

// Year spans -> "1991–2006, 2010" with overlapping and touching spans joined.
function envelope(spans: Span[]): string {
  const sorted = [...spans].sort((a, b) => a.year_start - b.year_start);
  const out: [number, number][] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.year_start <= last[1] + 1) last[1] = Math.max(last[1], s.year_end);
    else out.push([s.year_start, s.year_end]);
  }
  return out.map(([a, b]) => yearRange(a, b)).join(', ');
}

export type ModelRow = { model: string; years: string };
export type FitRow =
  | ({ kind: 'model' } & ModelRow)
  | { kind: 'family'; key: string; name: string; years: string; models: ModelRow[] };

// byModel, with codes of the same named bike (span.family_key) folded into one
// family row when two or more of them are listed. First-appearance order kept.
export function byFamily(spans: Span[]): FitRow[] {
  const groups = new Map<string, Span[]>();
  for (const s of spans) {
    const k = s.family_key ?? `code:${s.model_code}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  return [...groups].flatMap(([key, ss]): FitRow[] => {
    const models = byModel(ss);
    if (models.length < 2) return models.map((m) => ({ kind: 'model', ...m }));
    return [{ kind: 'family', key, name: titleCase(ss[0].family ?? models[0].model), years: envelope(ss), models }];
  });
}

export const PLATFORM_LABEL: Record<string, string> = {
  touring: 'Touring',
  softail: 'Softail',
  dyna: 'Dyna',
  sportster: 'Sportster',
  trike: 'Trike',
  fxr: 'FXR',
  fx: 'FX Super Glide',
  fl: 'FL Big Twin',
  vintage: 'Vintage',
  v_rod: 'V-Rod',
  street: 'Street',
  revolution_max: 'Revolution Max',
};

export const platformLabel = (p: string) =>
  PLATFORM_LABEL[p] ?? p.replace(/_/g, ' ').replace(/\b([a-z])/g, (m) => m.toUpperCase());

// Spec options -> lines for the bike header. "53.9 ci (883 cc) · 4-speed", then
// horsepower / compression when the document prints them. Two options = H-D sold
// both engines that year (or changed mid-year).
const ci = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
export function specLines(specs: Spec[]): { lines: string[]; note: string | null } {
  const lines = specs.map((s) =>
    [s.ci != null ? `${ci(s.ci)} ci${s.cc != null ? ` (${s.cc} cc)` : ''}` : null, s.speeds != null ? `${s.speeds}\u2011speed` : null]
      .filter(Boolean)
      .join(' · ')
  );
  const extra = [...new Set(specs.map((s) => [s.horsepower, s.compression && `${s.compression} compression`].filter(Boolean).join(' · ')).filter(Boolean))];
  const note =
    specs.length > 1 ? (specs.some((s) => s.mid_year_change) ? 'Engine changed mid-year' : 'Sold with either engine this year') : null;
  return { lines: [...new Set(lines.filter(Boolean))].concat(extra), note };
}
