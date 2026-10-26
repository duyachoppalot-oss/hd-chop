// Client for apps/api (docs/SPEC.md "API"). Override the base URL with
// EXPO_PUBLIC_API_URL (e.g. http://<mac-ip>:3001 against the local dev server).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://hdchop.5.161.100.126.nip.io').replace(/\/$/, '');
// Sent as X-App-Key (apps/api/middleware.ts). Local runs: apps/mobile/.env; EAS builds: EAS env vars.
const APP_KEY = process.env.EXPO_PUBLIC_APP_KEY ?? '';

// family / family_key: the named bike the code belongs to (FLHRCI -> "ROAD KING",
// key "touring:FLHR"), from apps/api/lib/familyRule.ts. Null when unknown.
export type Span = { model_code: string; year_start: number; year_end: number; family?: string | null; family_key?: string | null };
export type ConditionSource = 'catalog_text' | 'inferred' | 'none';
export type Part = {
  chain_root: string;
  oem: string;
  replaces: string[];
  description: string | null;
  conditions: string[];
  condition_source: ConditionSource;
  spans: Span[];
};
// Engine / transmission option from an H-D document; several = options sold that year.
export type Spec = {
  ci: number | null;
  cc: number | null;
  speeds: number | null;
  horsepower: string | null;
  compression: string | null;
  mid_year_change: boolean;
  source_ref: string;
};
// Stock chassis sizes in our wording ('19 x 2.15 in', '100/90-19', '25 mm');
// [] when no source covers a field. Older API builds omit it.
export type Chassis = {
  wheel_front: string[];
  wheel_rear: string[];
  tire_front: string[];
  tire_rear: string[];
  axle_front: string[];
  axle_rear: string[];
  fork_tube: string[];
  handlebar: string[];
};
export type Model = {
  model_code: string;
  model_name: string | null;
  platform: string;
  has_parts: boolean;
  specs: Spec[];
  chassis?: Chassis;
  family?: string | null;
  family_key?: string | null;
};
export type SearchResponse = {
  query: string;
  vehicle: { year: number; model_code: string; model_name: string | null; platform: string };
  concepts: { slug: string; display_name: string; match: 'exact' | 'trigram' }[];
  results: { concept: { slug: string; display_name: string }; parts: Part[] }[];
  fallback: Part[] | null;
};
export type PartDetail = {
  requested: string;
  oem: string;
  description: string | null;
  concept: string | null;
  concept_slug: string | null;
  chain: { oem: string; description: string | null; number_source: string }[];
  supersession: { from: string; to: string }[];
  fits: { conditions: string[]; spans: Span[] }[];
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { signal, headers: APP_KEY ? { 'X-App-Key': APP_KEY } : {} });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'Can’t reach the parts counter. Check your connection.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  years: (signal?: AbortSignal) => get<{ years: number[] }>('/v1/years', signal).then((r) => r.years),
  models: (year: number, signal?: AbortSignal) =>
    get<{ year: number; models: Model[] }>(`/v1/models?year=${year}`, signal).then((r) => r.models),
  search: (year: number, model: string, q: string, all: boolean, signal?: AbortSignal) =>
    get<SearchResponse>(
      `/v1/search?year=${year}&model=${encodeURIComponent(model)}&q=${encodeURIComponent(q)}${all ? '&all=1' : ''}`,
      signal
    ),
  part: (oem: string, signal?: AbortSignal) => get<PartDetail>(`/v1/part/${encodeURIComponent(oem)}`, signal),
};
