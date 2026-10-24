import type { Span } from './api';

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
