import { normOem, query } from './db';
import { chainMembers, cleanName, partsNamedLike } from './compare';

// Lineage of a part (/lineage): every part of the same kind used on the same bikes, as
// part chains (a chain = numbers linked by supersession, oldest first) laid out by year,
// with "next design" handoffs: on a model, the year one chain stops and another starts.
// Same kind = named like the part (noun agrees, every word present; editable), plus the
// part's own chain. Same bikes = shares a model code with the part on that family.

export type LChain = {
  root: string; name: string; members: string[]; steps: [string, string][];
  from: number; to: number; runs: [number, number][]; models: string[]; isSubject: boolean;
};
export type Handoff = { from: string; to: string; year: number; models: string[] };

// "Cover assembly, primary" -> "primary cover assembly" (cleanName drops the filler)
const joinedName = (d: string) => {
  const [head, ...rest] = d.split(',');
  return `${rest.join(' ')} ${head}`.trim();
};

export async function lineage(oemIn: string, familyIn?: string, matchIn?: string) {
  const key = normOem(oemIn);
  const [subj] = await query<{ oem_number: string; oem_display: string; chain_root: string; description_clean: string | null }>(
    `SELECT p.oem_number, p.oem_display, p.chain_root, coalesce(r.description_clean, p.description_clean) AS description_clean
     FROM oem_parts p LEFT JOIN oem_parts r ON r.oem_number = p.chain_root WHERE p.oem_number = $1`, [key]);
  if (!subj) return { error: `unknown part ${oemIn}` };
  const match = (matchIn ?? cleanName(joinedName(subj.description_clean ?? ''))).slice(0, 80);

  const named = match ? await partsNamedLike(match) : [];
  const own = await query<{ oem_number: string }>(`SELECT oem_number FROM oem_parts WHERE chain_root = $1`, [subj.chain_root]);
  const keys = [...new Set([...named.map((p) => p.oem.replace(/-/g, '').toUpperCase()), ...own.map((o) => o.oem_number)])];

  const fit = await query<{ chain_root: string; platform: string; year: number; model_code: string }>(
    `SELECT DISTINCT p.chain_root, v.platform, v.year, v.model_code
     FROM fitment f JOIN vehicles v USING (vehicle_id) JOIN oem_parts p USING (oem_number)
     WHERE p.oem_number = ANY($1) AND f.confidence IN ('high', 'medium')`, [keys]);

  // families the part itself fits, most model-years first
  const famCount = new Map<string, number>();
  for (const r of fit) if (r.chain_root === subj.chain_root) famCount.set(r.platform, (famCount.get(r.platform) ?? 0) + 1);
  const families = [...famCount].sort((a, z) => z[1] - a[1]).map(([f]) => f);
  const base = { subject: { oem: subj.oem_display, root: subj.chain_root, name: subj.description_clean }, match, families };
  if (!families.length) return { ...base, family: null, chains: [], handoffs: [] };
  const family = familyIn && families.includes(familyIn) ? familyIn : families[0];

  const rows = fit.filter((r) => r.platform === family);
  const subjModels = new Set(rows.filter((r) => r.chain_root === subj.chain_root).map((r) => r.model_code));
  // chains that share a model code with the part; per chain: years, models
  const byChain = new Map<string, { years: Set<number>; models: Set<string>; my: Map<string, Set<number>> }>();
  for (const r of rows) {
    const c = byChain.get(r.chain_root) ?? byChain.set(r.chain_root, { years: new Set(), models: new Set(), my: new Map() }).get(r.chain_root)!;
    c.years.add(r.year); c.models.add(r.model_code);
    (c.my.get(r.model_code) ?? c.my.set(r.model_code, new Set()).get(r.model_code)!).add(r.year);
  }
  for (const [root, c] of byChain) if (![...c.models].some((m) => subjModels.has(m))) byChain.delete(root);

  const roots = [...byChain.keys()];
  const names = new Map((await query<{ oem_number: string; description_clean: string | null }>(
    `SELECT oem_number, description_clean FROM oem_parts WHERE oem_number = ANY($1)`, [roots])).map((r) => [r.oem_number, r.description_clean ?? '']));
  const mem = await chainMembers(roots);
  const chains: LChain[] = roots.map((root) => {
    const c = byChain.get(root)!;
    const ys = [...c.years].sort((a, z) => a - z);
    const runs: [number, number][] = [];
    for (const y of ys) { const r = runs[runs.length - 1]; if (r && y === r[1] + 1) r[1] = y; else runs.push([y, y]); }
    const m = mem.get(root);
    return { root: m?.members[m.members.length - 1] ?? root, name: names.get(root) ?? '', members: m?.members ?? [root], steps: m?.steps ?? [],
      from: ys[0], to: ys[ys.length - 1], runs, models: [...c.models].sort(), isSubject: root === subj.chain_root };
  }).sort((a, z) => a.from - z.from || a.to - z.to || a.root.localeCompare(z.root));

  // handoffs: per model, a chain that stops being used and one that starts the next year
  // chain key -> its display number (newest in the chain), built from the keys, not the sorted list
  const disp = new Map(roots.map((root) => { const m = mem.get(root); return [root, m?.members[m.members.length - 1] ?? root] as const; }));
  const hand = new Map<string, Handoff>();
  const allModels = new Set(rows.map((r) => r.model_code));
  for (const model of allModels) {
    const users = roots.map((root) => ({ root, ys: byChain.get(root)!.my.get(model) })).filter((u) => u.ys);
    for (const a of users) for (const b of users) {
      if (a.root === b.root) continue;
      for (const y of b.ys!) {
        if (b.ys!.has(y - 1) || !a.ys!.has(y - 1) || a.ys!.has(y)) continue;
        const k = `${a.root}>${b.root}>${y}`;
        const h = hand.get(k) ?? hand.set(k, { from: disp.get(a.root)!, to: disp.get(b.root)!, year: y, models: [] }).get(k)!;
        h.models.push(model);
      }
    }
  }
  const handoffs = [...hand.values()].sort((a, z) => a.year - z.year || z.models.length - a.models.length);
  return { ...base, family, chains, handoffs };
}
