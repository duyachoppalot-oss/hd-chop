import { MODEL_RE, normOem, query } from '@/lib/db';

// Neighbours of one node for the web view.
//   part:<oem>      -> its concept, chain parts (supersession), models it fits
//   model:<code>    -> concepts it has parts in
//   concept:<slug>  -> parts fitting the models already on screen (?models=),
//                      else the models with the most part chains
type Node = { id: string; type: 'part' | 'model' | 'concept'; label: string; sub?: string };
type Edge = { id: string; source: string; target: string; label?: string; kind: 'fits' | 'supersedes' | 'is' | 'has' };

const yrs = (a: number, b: number) => (a === b ? `${a}` : `${a}–${String(b).slice(2)}`);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const [type, raw = ''] = (url.searchParams.get('node') ?? '').split(':');
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edge = (e: Omit<Edge, 'id'>) => edges.push({ ...e, id: `${e.source}>${e.target}` });

  if (type === 'part') {
    const key = normOem(raw);
    const p = (await query<{ chain_root: string; oem_display: string; description_clean: string | null; slug: string | null; display_name: string | null }>(
      `SELECT p.chain_root, p.oem_display, p.description_clean, c.slug, c.display_name
       FROM oem_parts p LEFT JOIN part_concepts c ON c.concept_id = coalesce(p.concept_id, (SELECT concept_id FROM oem_parts r WHERE r.oem_number = p.chain_root))
       WHERE p.oem_number = $1`, [key]))[0];
    if (!p) return Response.json({ nodes, edges });
    const me = `part:${key}`;
    nodes.push({ id: me, type: 'part', label: p.oem_display, sub: p.description_clean ?? '' });
    if (p.slug) {
      nodes.push({ id: `concept:${p.slug}`, type: 'concept', label: p.display_name ?? p.slug });
      edge({ source: me, target: `concept:${p.slug}`, kind: 'is' });
    }
    const sup = await query<{ from_oem: string; to_oem: string; fd: string; td: string; fdesc: string | null; tdesc: string | null }>(
      `SELECT s.from_oem, s.to_oem, f.oem_display AS fd, t.oem_display AS td, f.description_clean AS fdesc, t.description_clean AS tdesc
       FROM oem_supersession s JOIN oem_parts f ON f.oem_number = s.from_oem JOIN oem_parts t ON t.oem_number = s.to_oem
       WHERE f.chain_root = $1`, [p.chain_root]);
    for (const s of sup) {
      nodes.push({ id: `part:${s.from_oem}`, type: 'part', label: s.fd, sub: s.fdesc ?? '' }, { id: `part:${s.to_oem}`, type: 'part', label: s.td, sub: s.tdesc ?? '' });
      edge({ source: `part:${s.from_oem}`, target: `part:${s.to_oem}`, kind: 'supersedes', label: 'replaced by' });
    }
    const fits = await query<{ model_code: string; spans: { a: number; b: number }[] }>(
      `SELECT model_code, json_agg(json_build_object('a', year_start, 'b', year_end) ORDER BY year_start) AS spans
       FROM fitment_spans WHERE chain_root = $1 GROUP BY 1 ORDER BY min(year_start), 1 LIMIT 60`, [p.chain_root]);
    for (const f of fits) {
      nodes.push({ id: `model:${f.model_code}`, type: 'model', label: f.model_code });
      edge({ source: me, target: `model:${f.model_code}`, kind: 'fits', label: f.spans.map((s) => yrs(s.a, s.b)).join(', ') });
    }
  } else if (type === 'model' && MODEL_RE.test(raw.toUpperCase())) {
    const code = raw.toUpperCase();
    const m = (await query<{ name: string | null; y0: number; y1: number }>(
      `SELECT max(model_name) AS name, min(year) AS y0, max(year) AS y1 FROM vehicles WHERE model_code = $1`, [code]))[0];
    nodes.push({ id: `model:${code}`, type: 'model', label: code, sub: `${m?.name ?? ''} ${m?.y0 ?? ''}–${m?.y1 ?? ''}`.trim() });
    const cs = await query<{ slug: string; display_name: string; n: number }>(
      `SELECT c.slug, c.display_name, count(DISTINCT s.chain_root)::int AS n
       FROM fitment_spans s JOIN part_concepts c USING (concept_id) WHERE s.model_code = $1
       GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 70`, [code]);
    for (const c of cs) {
      nodes.push({ id: `concept:${c.slug}`, type: 'concept', label: c.display_name });
      edge({ source: `model:${code}`, target: `concept:${c.slug}`, kind: 'has', label: `${c.n}` });
    }
  } else if (type === 'concept') {
    const c = (await query<{ concept_id: number; display_name: string }>(`SELECT concept_id, display_name FROM part_concepts WHERE slug = $1`, [raw]))[0];
    if (!c) return Response.json({ nodes, edges });
    const me = `concept:${raw}`;
    nodes.push({ id: me, type: 'concept', label: c.display_name });
    const models = (url.searchParams.get('models') ?? '').split(',').map((s) => s.toUpperCase()).filter((s) => MODEL_RE.test(s));
    if (models.length) {
      const rows = await query<{ chain_root: string; oem_display: string; description_clean: string | null; model_code: string; spans: { a: number; b: number }[] }>(
        `SELECT s.chain_root, p.oem_display, p.description_clean, s.model_code,
                json_agg(json_build_object('a', s.year_start, 'b', s.year_end) ORDER BY s.year_start) AS spans
         FROM fitment_spans s JOIN oem_parts p ON p.oem_number = s.chain_root
         WHERE s.concept_id = $1 AND s.model_code = ANY($2)
         GROUP BY 1, 2, 3, 4 ORDER BY 2 LIMIT 150`, [c.concept_id, models]);
      for (const r of rows.filter((r, i, a) => a.findIndex((x) => x.chain_root === r.chain_root) === i).slice(0, 60)) {
        nodes.push({ id: `part:${r.chain_root}`, type: 'part', label: r.oem_display, sub: r.description_clean ?? '' });
        edge({ source: `part:${r.chain_root}`, target: me, kind: 'is' });
      }
      const shown = new Set(nodes.map((n) => n.id));
      for (const r of rows) {
        if (!shown.has(`part:${r.chain_root}`)) continue;
        edge({ source: `part:${r.chain_root}`, target: `model:${r.model_code}`, kind: 'fits', label: r.spans.map((s) => yrs(s.a, s.b)).join(', ') });
      }
    } else {
      const ms = await query<{ model_code: string; n: number }>(
        `SELECT model_code, count(DISTINCT chain_root)::int AS n FROM fitment_spans WHERE concept_id = $1
         GROUP BY 1 ORDER BY 2 DESC LIMIT 50`, [c.concept_id]);
      for (const m of ms) {
        nodes.push({ id: `model:${m.model_code}`, type: 'model', label: m.model_code });
        edge({ source: `model:${m.model_code}`, target: me, kind: 'has', label: `${m.n}` });
      }
    }
  }
  const seen = new Set<string>();
  return Response.json({
    nodes: nodes.filter((n) => !seen.has(n.id) && seen.add(n.id)),
    edges: edges.filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i),
  });
}
