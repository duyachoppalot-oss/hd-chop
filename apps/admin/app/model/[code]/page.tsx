import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MODEL_RE, query } from '@/lib/db';
import { Notes } from '@/components/Notes';
import { Timeline, toneFor, yearsText, type Group, type Lane } from '@/components/Timeline';

export const dynamic = 'force-dynamic';

type Span = {
  chain_root: string;
  conditions: string[];
  year_start: number;
  year_end: number;
  oem_display: string;
  description_clean: string | null;
  slug: string | null;
  display_name: string | null;
  category: string | null;
};

const LANE_CAP = 1500;

// One model's whole life: every part (grouped by concept) as bars across the
// years it fit. Header shades the years the model was built.
export default async function ModelPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ q?: string; all?: string }>;
}) {
  const code = (await params).code.toUpperCase();
  if (!MODEL_RE.test(code)) notFound();
  const { q = '', all } = await searchParams;
  const showAll = all === '1';

  const vehicles = await query<{ year: number; model_name: string | null; platform: string; engine: string | null; fuel_system: string; has_parts: boolean }>(
    `SELECT year, model_name, platform, engine, fuel_system,
            EXISTS (SELECT 1 FROM fitment f WHERE f.vehicle_id = v.vehicle_id) AS has_parts
     FROM vehicles v WHERE model_code = $1 ORDER BY year`,
    [code]
  );
  if (!vehicles.length) notFound();

  const spans = await query<Span>(
    `SELECT s.chain_root, s.conditions, s.year_start, s.year_end, p.oem_display, p.description_clean,
            c.slug, c.display_name, c.category
     FROM fitment_spans s
     JOIN oem_parts p ON p.oem_number = s.chain_root
     LEFT JOIN part_concepts c ON c.concept_id = s.concept_id
     WHERE s.model_code = $1 AND ($2 OR s.concept_id IS NOT NULL)
       AND ($3 = '' OR p.description_clean ILIKE '%' || $3 || '%' OR p.oem_display ILIKE $3 || '%' OR c.display_name ILIKE '%' || $3 || '%')
     ORDER BY c.category NULLS LAST, c.display_name NULLS LAST, s.year_start, p.oem_display`,
    [code, showAll, q.trim()]
  );
  // Engine / transmission options per year from H-D documents (vehicle_specs, migration 006).
  const specRows = await query<{ year: number; ci: string | null; cc: number | null; speeds: number | null; source_ref: string; mid_year_change: boolean }>(
    `SELECT v.year, s.displacement_ci::text AS ci, s.displacement_cc AS cc, s.transmission_speeds AS speeds, s.source_ref, s.mid_year_change
     FROM vehicle_specs s JOIN vehicles v USING (vehicle_id) WHERE v.model_code = $1
     ORDER BY v.year, s.displacement_ci, s.transmission_speeds`,
    [code]
  );
  const specsByYear = new Map<number, typeof specRows>();
  for (const r of specRows) (specsByYear.get(r.year) ?? specsByYear.set(r.year, []).get(r.year)!).push(r);
  const specText = (rs: typeof specRows) =>
    rs.map((r) => [r.ci != null ? `${Number(r.ci)} ci` : null, r.speeds != null ? `${r.speeds}-sp` : null].filter(Boolean).join(' · ')).join(' / ') +
    (rs.some((r) => r.mid_year_change) ? ' (mid-year)' : '');
  const counts = await query<{ total: number; with_concept: number }>(
    `SELECT count(DISTINCT chain_root)::int AS total, count(DISTINCT chain_root) FILTER (WHERE concept_id IS NOT NULL)::int AS with_concept
     FROM fitment_spans WHERE model_code = $1`,
    [code]
  );

  // concept -> chain -> lane
  const groups = new Map<string, Group>();
  const lanes = new Map<string, Lane>();
  const tones = new Map<string, string>();
  let laneCount = 0;
  for (const s of spans) {
    const gk = s.slug ?? '_none';
    if (!groups.has(gk)) {
      groups.set(gk, {
        key: gk,
        title: s.slug ? <Link href={`/concept/${s.slug}?model=${code}`}>{s.display_name} <span className="muted small">{s.category}</span></Link> : 'No concept',
        lanes: [],
      });
    }
    const lk = `${gk}|${s.chain_root}`;
    let lane = lanes.get(lk);
    if (!lane) {
      if (laneCount >= LANE_CAP) continue;
      laneCount++;
      lane = { key: lk, label: s.oem_display, sub: s.description_clean ?? '', href: `/part/${s.chain_root}`, bars: [] };
      lanes.set(lk, lane);
      groups.get(gk)!.lanes.push(lane);
    }
    const cond = s.conditions.length ? ` {${s.conditions.join(', ')}}` : '';
    lane.bars.push({
      start: s.year_start,
      end: s.year_end,
      label: `${yearsText(s.year_start, s.year_end)}${cond}`,
      title: `${s.oem_display} ${s.description_clean ?? ''}\n${code} ${yearsText(s.year_start, s.year_end)}${cond}`,
      href: `/part/${s.chain_root}`,
      tone: toneFor(s.conditions.join(','), tones),
    });
  }

  const built = new Set(vehicles.map((v) => v.year));
  const from = Math.min(...vehicles.map((v) => v.year), ...spans.map((s) => s.year_start)) - 1;
  const to = Math.max(...vehicles.map((v) => v.year), ...spans.map((s) => s.year_end)) + 1;
  const names = [...new Set(vehicles.map((v) => v.model_name).filter(Boolean))];
  const engines = [...new Set(vehicles.map((v) => v.engine).filter(Boolean))];
  const noParts = vehicles.filter((v) => !v.has_parts).map((v) => v.year);
  const back = `/model/${code}`;

  return (
    <>
      <h1>
        {code} <span className="muted" style={{ fontSize: 18 }}>{names.join(' / ')}</span>
      </h1>
      <p className="muted">
        {vehicles[0].platform} · {engines.join(', ') || 'engine unknown'} · built {vehicles[0].year}–{vehicles[vehicles.length - 1].year} ({vehicles.length} model years)
        {noParts.length ? ` · no parts yet for ${noParts.join(', ')}` : ''}
        {' · '}
        <Link href={`/web?seed=model:${code}`}>Open in web →</Link>
      </p>

      <div className="cols">
        <div>
          <form className="filters">
            <input name="q" defaultValue={q} placeholder="Filter: name, number or concept" />
            <label className="row small">
              <input type="checkbox" name="all" value="1" defaultChecked={showAll} /> Include parts with no concept ({counts[0].total - counts[0].with_concept})
            </label>
            <button type="submit">Filter</button>
          </form>
          <p className="small muted">
            {lanes.size} part chains{laneCount >= LANE_CAP ? ` (capped at ${LANE_CAP}; filter to narrow)` : ''}. Bar color = condition set; hover for details, click to open the part.
          </p>
          <Timeline from={from} to={to} groups={[...groups.values()]} corner={`${code} · part chain`} exists={built} />
        </div>
        <div>
          <Notes kind="model" target={code} back={back} title={`Notes on ${code}`} />
          <div className="panel" style={{ marginTop: 14 }}>
            <h3>Model years</h3>
            <table className="list small">
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.year}>
                    <td className="mono">{v.year}</td>
                    <td>{v.model_name}</td>
                    <td className="muted">{v.engine}</td>
                    <td className="muted">{v.fuel_system}</td>
                    <td className="mono" title={(specsByYear.get(v.year) ?? []).map((r) => r.source_ref).join('\n')}>
                      {specsByYear.has(v.year) ? specText(specsByYear.get(v.year)!) : ''}
                    </td>
                    <td>{v.has_parts ? '' : <span style={{ color: 'var(--red)' }}>no parts</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
