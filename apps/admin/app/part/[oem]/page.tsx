import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normOem, query } from '@/lib/db';
import { Notes } from '@/components/Notes';
import { OverrideForms } from '@/components/OverrideForms';
import { OVERRIDE_SELECT, OverrideList, type Override } from '@/components/OverrideList';
import { Timeline, type Bar, type Group, type Lane } from '@/components/Timeline';

export const dynamic = 'force-dynamic';

type Member = {
  oem_number: string;
  oem_display: string;
  description_clean: string | null;
  number_source: string;
  source: string;
  slug: string | null;
  display_name: string | null;
};
type Row = {
  oem_number: string;
  model_code: string;
  platform: string;
  year: number;
  source: string;
  confidence: string;
  conditions: string[];
  source_ref: string;
  hidden_by: number | null;
};

// Which tone a year cell gets when several rows land on it: the strongest.
const RANK = ['admin', 'oem_catalog', 'service_catalog', 'inferred_span', 'low', 'hidden'];
const toneOf = (r: Row) => (r.hidden_by != null ? 'hidden' : r.confidence === 'low' ? 'low' : r.source);

// Every raw fitment row behind one part chain, year by year, colored by
// where it came from, plus the hidden rows. This is where fixes are made.
export default async function PartPage({ params }: { params: Promise<{ oem: string }> }) {
  const key = normOem(decodeURIComponent((await params).oem));
  const part = (await query<{ chain_root: string }>(`SELECT chain_root FROM oem_parts WHERE oem_number = $1`, [key]))[0];
  if (!part) notFound();
  const root = part.chain_root;

  const members = await query<Member>(
    `SELECT p.oem_number, p.oem_display, p.description_clean, p.number_source, p.source, c.slug, c.display_name
     FROM oem_parts p LEFT JOIN part_concepts c USING (concept_id)
     WHERE p.chain_root = $1 ORDER BY p.oem_number = $1 DESC, p.oem_display`,
    [root]
  );
  const nums = members.map((m) => m.oem_number);
  const supersession = await query<{ from_oem: string; to_oem: string; source: string }>(
    `SELECT from_oem, to_oem, source FROM oem_supersession WHERE from_oem = ANY($1) OR to_oem = ANY($1)`,
    [nums]
  );
  const rows = await query<Row>(
    `SELECT f.oem_number, v.model_code, v.platform, v.year, f.source, f.confidence, f.conditions, f.source_ref, NULL::int AS hidden_by
     FROM fitment f JOIN vehicles v USING (vehicle_id) WHERE f.oem_number = ANY($1)
     UNION ALL
     SELECT h.oem_number, v.model_code, v.platform, v.year, h.source, h.confidence, h.conditions, h.source_ref, h.override_id
     FROM fitment_hidden h JOIN vehicles v USING (vehicle_id) WHERE h.oem_number = ANY($1)
     ORDER BY 3, 2, 4`,
    [nums]
  );
  const overrides = await query<Override>(`${OVERRIDE_SELECT} WHERE o.oem_number = ANY($1) ORDER BY o.override_id DESC`, [nums]);
  const concepts = await query<{ slug: string; display_name: string }>(`SELECT slug, display_name FROM part_concepts ORDER BY display_name`);
  const tags = await query<{ tag: string; label: string }>(`SELECT tag, label FROM condition_tags ORDER BY label`);
  const allModels = (await query<{ model_code: string }>(`SELECT DISTINCT model_code FROM vehicles ORDER BY 1`)).map((r) => r.model_code);

  // Lanes: one per (part number, model); per year keep every row for the hover text.
  const display = new Map(members.map((m) => [m.oem_number, m.oem_display]));
  const laneRows = new Map<string, { m: string; oem: string; platform: string; years: Map<number, Row[]> }>();
  for (const r of rows) {
    const k = `${r.oem_number}|${r.model_code}`;
    if (!laneRows.has(k)) laneRows.set(k, { m: r.model_code, oem: r.oem_number, platform: r.platform, years: new Map() });
    const ys = laneRows.get(k)!.years;
    if (!ys.has(r.year)) ys.set(r.year, []);
    ys.get(r.year)!.push(r);
  }
  const groups = new Map<string, Group>();
  for (const l of laneRows.values()) {
    const gk = l.oem;
    if (!groups.has(gk)) {
      const m = members.find((x) => x.oem_number === gk)!;
      groups.set(gk, { key: gk, title: <>{m.oem_display} <span className="muted small">{m.description_clean}</span></>, lanes: [] });
    }
    // Merge consecutive years with the same tone into one bar.
    const bars: Bar[] = [];
    for (const y of [...l.years.keys()].sort((a, b) => a - b)) {
      const rs = l.years.get(y)!;
      const tone = rs.map(toneOf).sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b))[0];
      const detail = rs
        .map((r) => `${y} ${r.source}/${r.confidence}${r.conditions.length ? ` {${r.conditions.join(', ')}}` : ''}${r.hidden_by ? ` HIDDEN by #${r.hidden_by}` : ''} · ${r.source_ref}`)
        .join('\n');
      const prev = bars[bars.length - 1];
      if (prev && prev.tone === tone && prev.end === y - 1) {
        prev.end = y;
        prev.title += `\n${detail}`;
      } else bars.push({ start: y, end: y, tone, title: `${display.get(l.oem)} on ${l.m}\n${detail}` });
    }
    for (const b of bars) b.label = b.start === b.end ? `${b.start}` : `${b.start}–${b.end}`;
    const lane: Lane = { key: `${l.oem}|${l.m}`, label: l.m, sub: l.platform, href: `/model/${l.m}`, bars };
    groups.get(gk)!.lanes.push(lane);
  }
  const years = rows.map((r) => r.year);
  const from = years.length ? Math.min(...years) - 1 : 2000;
  const to = years.length ? Math.max(...years) + 1 : 2001;
  const head = members.find((m) => m.oem_number === key) ?? members[0];
  const fitsModels = [...new Set(rows.filter((r) => r.hidden_by == null).map((r) => r.model_code))].sort();
  const back = `/part/${key}`;

  return (
    <>
      <h1 className="mono" style={{ fontFamily: 'var(--font-sign)' }}>
        {head.oem_display} <span className="muted" style={{ fontSize: 18 }}>{head.description_clean}</span>
      </h1>
      <p className="muted">
        Concept: {head.slug ? <Link href={`/concept/${head.slug}`}>{head.display_name}</Link> : 'none'} · number {head.number_source} · source {head.source}
        {root !== key ? <> · chain root <Link href={`/part/${root}`} className="mono">{display.get(root)}</Link></> : null}
        {' · '}
        <Link href={`/web?seed=part:${key}`}>Open in web →</Link>
      </p>

      <div className="cols">
        <div>
          {members.length > 1 || supersession.length ? (
            <div className="panel" style={{ marginBottom: 14 }}>
              <h3>Supersession chain</h3>
              <div className="chips" style={{ marginTop: 6 }}>
                {members.map((m) => (
                  <Link key={m.oem_number} href={`/part/${m.oem_number}`} className={`chip mono${m.oem_number === key ? ' on' : ''}`}>
                    {m.oem_display}
                  </Link>
                ))}
              </div>
              <p className="small muted" style={{ marginBottom: 0 }}>
                {supersession.map((s) => `${display.get(s.from_oem) ?? s.from_oem} → ${display.get(s.to_oem) ?? s.to_oem}`).join(' · ')}
              </p>
            </div>
          ) : null}
          <div className="legend">
            <span><i className="t-oem_catalog" />oem catalog</span>
            <span><i className="t-service_catalog" />service catalog</span>
            <span><i className="t-inferred_span" />inferred (hole bridged)</span>
            <span><i className="t-admin" />added by you</span>
            <span><i className="t-low" />low confidence (not shown in app)</span>
            <span><i className="t-hidden" />hidden by you</span>
          </div>
          {rows.length ? (
            <Timeline from={from} to={to} groups={[...groups.values()]} corner="model · year by year" />
          ) : (
            <p className="muted">No fitment rows for this chain.</p>
          )}
          <h2>Overrides on this chain</h2>
          <div className="panel">
            <OverrideList items={overrides} back={back} />
          </div>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <OverrideForms
            back={back}
            members={members.map((m) => ({ oem_number: m.oem_number, oem_display: m.oem_display, description: m.description_clean, concept: m.slug }))}
            models={fitsModels}
            allModels={allModels}
            concepts={concepts}
            tags={tags}
          />
          <Notes kind="part" target={key} back={back} title={`Notes on ${head.oem_display}`} />
        </div>
      </div>
    </>
  );
}
