import Link from 'next/link';
import { notFound } from 'next/navigation';
import { query } from '@/lib/db';
import { Notes } from '@/components/Notes';
import { Timeline, toneFor, yearsText, type Group, type Lane } from '@/components/Timeline';

export const dynamic = 'force-dynamic';

type Span = {
  chain_root: string;
  model_code: string;
  conditions: string[];
  year_start: number;
  year_end: number;
  oem_display: string;
  description_clean: string | null;
  platform: string;
};

// One concept (fuel tank, seat…) across every model and year: rows are models
// grouped by platform, bars are part chains. Same color = same part, so a part
// shared across models lines up visually.
export default async function ConceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ platform?: string; model?: string }>;
}) {
  const slug = (await params).slug;
  const { platform = '', model = '' } = await searchParams;
  const concept = (
    await query<{ concept_id: number; display_name: string; category: string | null; hd_terms: string[]; user_terms: string[] }>(
      `SELECT concept_id, display_name, category, hd_terms, user_terms FROM part_concepts WHERE slug = $1`,
      [slug]
    )
  )[0];
  if (!concept) notFound();

  const spans = await query<Span>(
    `SELECT s.chain_root, s.model_code, s.conditions, s.year_start, s.year_end, p.oem_display, p.description_clean,
            m.platform
     FROM fitment_spans s
     JOIN oem_parts p ON p.oem_number = s.chain_root
     JOIN LATERAL (SELECT platform FROM vehicles v WHERE v.model_code = s.model_code ORDER BY year DESC LIMIT 1) m ON true
     WHERE s.concept_id = $1 AND ($2 = '' OR m.platform = $2)
     ORDER BY m.platform, s.model_code, s.year_start`,
    [concept.concept_id, platform]
  );
  const platforms = await query<{ platform: string; n: number }>(
    `SELECT m.platform, count(*)::int AS n FROM fitment_spans s
     JOIN LATERAL (SELECT platform FROM vehicles v WHERE v.model_code = s.model_code ORDER BY year DESC LIMIT 1) m ON true
     WHERE s.concept_id = $1 GROUP BY 1 ORDER BY 1`,
    [concept.concept_id]
  );

  // Order platforms and models by first year so the chart reads left to right.
  const first = new Map<string, number>();
  for (const s of spans) {
    first.set(s.model_code, Math.min(first.get(s.model_code) ?? 9999, s.year_start));
    first.set(`p:${s.platform}`, Math.min(first.get(`p:${s.platform}`) ?? 9999, s.year_start));
  }
  const groups = new Map<string, Group>();
  const lanes = new Map<string, Lane>();
  const tones = new Map<string, string>();
  const parts = new Set<string>();
  for (const s of spans) {
    parts.add(s.chain_root);
    if (!groups.has(s.platform)) groups.set(s.platform, { key: s.platform, title: s.platform, lanes: [] });
    let lane = lanes.get(s.model_code);
    if (!lane) {
      lane = {
        key: s.model_code,
        label: s.model_code === model ? <b style={{ color: 'var(--cream)' }}>▸ {s.model_code}</b> : s.model_code,
        href: `/model/${s.model_code}`,
        bars: [],
      };
      lanes.set(s.model_code, lane);
      groups.get(s.platform)!.lanes.push(lane);
    }
    const cond = s.conditions.length ? ` {${s.conditions.join(', ')}}` : '';
    lane.bars.push({
      start: s.year_start,
      end: s.year_end,
      label: s.oem_display,
      title: `${s.oem_display} ${s.description_clean ?? ''}\n${s.model_code} ${yearsText(s.year_start, s.year_end)}${cond}`,
      href: `/part/${s.chain_root}`,
      tone: toneFor(s.chain_root, tones),
    });
  }
  const ordered = [...groups.values()].sort((a, b) => first.get(`p:${a.key}`)! - first.get(`p:${b.key}`)!);
  for (const g of ordered) g.lanes.sort((a, b) => first.get(a.key)! - first.get(b.key)! || a.key.localeCompare(b.key));
  const from = spans.length ? Math.min(...spans.map((s) => s.year_start)) - 1 : 2000;
  const to = spans.length ? Math.max(...spans.map((s) => s.year_end)) + 1 : 2001;
  const qs = (p: string) => `/concept/${slug}?${new URLSearchParams({ ...(p ? { platform: p } : {}), ...(model ? { model } : {}) })}`;

  return (
    <>
      <h1>{concept.display_name}</h1>
      <p className="muted">
        {concept.category} · {parts.size} part chains on {lanes.size} models · catalog words: {concept.hd_terms.slice(0, 8).join(', ')} · people type:{' '}
        {concept.user_terms.slice(0, 8).join(', ')} · <Link href={`/web?seed=concept:${slug}`}>Open in web →</Link>
      </p>
      <div className="cols">
        <div>
          <div className="chips filters">
            <Link href={qs('')} className={`chip${platform ? '' : ' on'}`}>All</Link>
            {platforms.map((p) => (
              <Link key={p.platform} href={qs(p.platform)} className={`chip${platform === p.platform ? ' on' : ''}`}>
                {p.platform} <span>{p.n}</span>
              </Link>
            ))}
          </div>
          <p className="small muted">Same color = same part chain (colors repeat every 8). Hover a bar for the part, click to open it.</p>
          <Timeline from={from} to={to} groups={ordered} corner="model" />
        </div>
        <div>
          <Notes kind="concept" target={slug} back={`/concept/${slug}`} title={`Notes on ${concept.display_name}`} />
        </div>
      </div>
    </>
  );
}
