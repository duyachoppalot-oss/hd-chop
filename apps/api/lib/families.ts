import { query } from './db';
import { buildFamilies, type Family, type FamilyVehicle } from './familyRule';

// Adds family / family_key to fitment spans (rule in familyRule.ts). The
// family map is built from vehicles once per server process; vehicles only
// change with an ETL run, which is followed by a deploy.
type Families = { byCode: Map<string, Family>; platform: Map<string, string> };
let cache: Promise<Families> | null = null;

function load(): Promise<Families> {
  if (!cache) {
    cache = query<FamilyVehicle>(`SELECT platform, model_code, model_name, year FROM vehicles`)
      .then((rows) => ({
        byCode: buildFamilies(rows),
        platform: new Map(rows.map((r) => [`${r.model_code}@${r.year}`, r.platform])),
      }))
      .catch((err) => {
        cache = null;
        throw err;
      });
  }
  return cache;
}

type Span = { model_code: string; year_start: number; year_end: number };
export type FamilySpan = Span & { family: string | null; family_key: string | null };

// The span's platform is the vehicle's at year_end (codes like FLH, FLHC,
// FXLR are reused across platforms in different years).
export async function withFamilies<T extends Span>(spans: T[]): Promise<(T & { family: string | null; family_key: string | null })[]> {
  const f = await load();
  return spans.map((s) => {
    const p = f.platform.get(`${s.model_code}@${s.year_end}`) ?? f.platform.get(`${s.model_code}@${s.year_start}`);
    const fam = p ? f.byCode.get(`${p}:${s.model_code}`) : undefined;
    return { ...s, family: fam?.name ?? null, family_key: fam?.key ?? null };
  });
}

// Family of a model code on a known platform (the models list has the platform).
export async function familyOf(platform: string, code: string): Promise<Family | null> {
  return (await load()).byCode.get(`${platform}:${code}`) ?? null;
}
