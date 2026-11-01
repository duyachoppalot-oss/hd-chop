import Link from 'next/link';
import { query } from '@/lib/db';

// Model page "spec card": everything we hold about one model-year in one place.
//   - the bike (vehicles), engine / transmission (vehicle_specs), stock wheel / tire / axle /
//     fork / bar sizes (vehicle_chassis_specs);
//   - NHTSA recalls (vehicle_recalls, migration 017);
//   - spec tables from that year's H-D owner's manuals (manual_specs, 017; admin only).
// A manual applies when its year matches and it is this bike's family manual, unless its
// title names specific codes (CVO "FLHTCUSE2 MODELS", "FLHRSEI2"): then only those codes.
// Police manuals apply to police codes; "All Models" manuals to every bike that year.
const POLICE = /^(FLHP|FLHTP|FXDP|FXRP|FLTRXP|FLHPE|FLHPI|FLHPEI|FLHTPI|FXDBP)/;
const FAMILY_OF_PLATFORM: Record<string, string[]> = { fl: ['fl_fx', 'touring'], fx: ['fl_fx'], v_rod: ['v_rod'], revolution_max: ['pan_america', 'sportster'] };
const KIND_ORDER = ['engine', 'transmission', 'gear_ratios', 'sprockets', 'ignition', 'capacities', 'weights', 'dimensions',
  'tire_sizes', 'tire_pressure', 'wheels', 'brakes', 'suspension', 'electrical', 'bulbs', 'fuel', 'other'];
const KIND_LABEL: Record<string, string> = { gear_ratios: 'gear ratios', tire_sizes: 'tire sizes', tire_pressure: 'tire pressure' };

type ManualRow = { manual: string; manual_ref: string; family: string; kind: string; table_title: string; page: number | null; label: string; value: string; ocr: boolean };

// 'own' = a manual made for this bike (its code in a CVO title, or a police manual for a
// police code); 'family' = the year's manual for its family or All Models; null = not this bike.
function applies(m: string, family: string, code: string, platform: string): 'own' | 'family' | null {
  const named = [...m.toUpperCase().matchAll(/\b(F[LX][A-Z0-9]*SE[I0-9]*|FLHRSEI2|FLTRSEI2?|VRSCSE2?|VRXSE)\b/g)].map((x) => x[1]);
  if (named.length) return named.includes(code) ? 'own' : null;
  if (/police/i.test(m)) return POLICE.test(code) ? 'own' : null;
  if (new RegExp(`\\b${code}\\b`).test(m.toUpperCase())) return 'own';
  if (/all models/i.test(m)) return 'family';
  return family === platform || (FAMILY_OF_PLATFORM[platform] ?? []).includes(family) ? 'family' : null;
}

export async function SpecCard({ code, years, year }: { code: string; years: number[]; year: number }) {
  const [v] = await query<{ vehicle_id: number; model_name: string | null; platform: string; engine: string | null; fuel_system: string }>(
    `SELECT vehicle_id, model_name, platform, engine, fuel_system FROM vehicles WHERE model_code = $1 AND year = $2`, [code, year]);
  if (!v) return null;
  const [specs, chassis, recalls, manualRows, recallYears] = await Promise.all([
    query<{ ci: string | null; cc: number | null; speeds: number | null; horsepower: string | null; compression_ratio: string | null; source_ref: string; mid_year_change: boolean }>(
      `SELECT displacement_ci::text AS ci, displacement_cc AS cc, transmission_speeds AS speeds, horsepower, compression_ratio, source_ref, mid_year_change
       FROM vehicle_specs WHERE vehicle_id = $1 ORDER BY displacement_ci`, [v.vehicle_id]),
    query<{ item: string; position: string; value: string; source_ref: string }>(
      `SELECT item, position, value, source_ref FROM vehicle_chassis_specs WHERE vehicle_id = $1 ORDER BY item, position, source_rank`, [v.vehicle_id]),
    query<{ campaign: string; report_date: string | null; component: string; hd_recall: string; summary: string; consequence: string; remedy: string; matched_by: string; nhtsa_model: string }>(
      `SELECT r.campaign, to_char(r.report_date, 'YYYY-MM-DD') AS report_date, r.component, r.hd_recall, r.summary, r.consequence, r.remedy, vr.matched_by, vr.nhtsa_model
       FROM vehicle_recalls vr JOIN nhtsa_recalls r USING (campaign) WHERE vr.vehicle_id = $1 ORDER BY r.report_date`, [v.vehicle_id]),
    query<ManualRow>(
      `SELECT manual, manual_ref, family, kind, table_title, page, label, value, ocr FROM manual_specs WHERE year = $1 ORDER BY manual, manual_spec_id`, [year]),
    query<{ year: number; n: number }>(
      `SELECT v.year, count(*)::int AS n FROM vehicle_recalls vr JOIN vehicles v USING (vehicle_id) WHERE v.model_code = $1 GROUP BY 1`, [code]),
  ]);
  // the bike's own manual wins over the family one (2007 FLHTP: police manual 103 ci, not Touring's 96)
  const fit = manualRows.map((r) => ({ r, how: applies(r.manual, r.family, code, v.platform) })).filter((x) => x.how);
  const own = fit.some((x) => x.how === 'own');
  const rows = fit.filter((x) => !own || x.how === 'own').map((x) => x.r);
  const manuals = [...new Map(rows.map((r) => [r.manual, r])).values()];
  const kinds = new Map<string, Map<string, ManualRow[]>>();
  for (const r of rows) {
    const k = KIND_ORDER.includes(r.kind) ? r.kind : 'other';
    const t = `${r.table_title}|${r.manual}`;
    const byTable = kinds.get(k) ?? kinds.set(k, new Map()).get(k)!;
    (byTable.get(t) ?? byTable.set(t, []).get(t)!).push(r);
  }
  const recallBy = new Map(recallYears.map((r) => [r.year, r.n]));
  const sizeLabel = (c: { item: string; position: string }) => `${c.position ? `${c.position} ` : ''}${c.item.replace('_', ' ')}`;

  return (
    <div className="panel speccard">
      <h3>Spec card · {code} {year}</h3>
      <div className="speccard-years">
        {years.map((y) => (
          <Link key={y} href={`?year=${y}#spec`} className={y === year ? 'on' : ''} title={recallBy.get(y) ? `${recallBy.get(y)} recall(s)` : ''}>
            {String(y).slice(2)}{recallBy.get(y) ? <sup>●</sup> : null}
          </Link>
        ))}
      </div>

      <dl className="speccard-facts">
        <dt>Bike</dt><dd>{v.model_name ?? <span className="muted">no name</span>} · {v.platform} · {v.engine ?? 'engine unknown'} · fuel {v.fuel_system}</dd>
        {specs.map((s, i) => (
          <FactRow key={i} label={i ? '' : 'Engine'} source={s.source_ref}>
            {[s.ci && `${Number(s.ci)} ci`, s.cc && `${s.cc} cc`, s.speeds && `${s.speeds}-speed`, s.horsepower && `${s.horsepower} hp`, s.compression_ratio && `${s.compression_ratio} CR`].filter(Boolean).join(' · ')}
            {s.mid_year_change ? ' (mid-year change)' : ''}
          </FactRow>
        ))}
        {chassis.map((c, i) => (
          <FactRow key={`c${i}`} label={sizeLabel(c)} source={c.source_ref}>{c.value}</FactRow>
        ))}
      </dl>

      <h4>Recalls ({recalls.length})</h4>
      {recalls.length ? recalls.map((r) => (
        <details key={r.campaign} className="speccard-recall">
          <summary>
            <a href={`https://www.nhtsa.gov/?nhtsaId=${r.campaign}`} target="_blank" rel="noreferrer" className="mono">{r.campaign}</a>{' '}
            {r.report_date} · {r.component}{r.hd_recall ? ` · H-D #${r.hd_recall}` : ''}
            {r.matched_by === 'summary' ? <span className="muted small"> · matched from the summary ({r.nhtsa_model})</span> : null}
          </summary>
          <p className="small">{r.summary}</p>
          {r.consequence ? <p className="small"><b>Risk:</b> {r.consequence}</p> : null}
          {r.remedy ? <p className="small"><b>Remedy:</b> {r.remedy}</p> : null}
        </details>
      )) : <p className="muted small">No NHTSA recalls matched to this bike.</p>}

      <h4>Owner&apos;s manual specs</h4>
      {manuals.length ? (
        <p className="muted small">
          From {manuals.map((m) => `${m.manual_ref || m.manual}${m.ocr ? ' (scan, OCR)' : ''}`).join('; ')}. Admin only until the legal review.
        </p>
      ) : <p className="muted small">No owner&apos;s manual for this year/family.</p>}
      {KIND_ORDER.filter((k) => kinds.has(k)).map((k) => (
        <details key={k} className="speccard-kind" open={['engine', 'capacities', 'tire_sizes', 'tire_pressure'].includes(k)}>
          <summary>{KIND_LABEL[k] ?? k.replace('_', ' ')} <span className="muted small">({[...kinds.get(k)!.values()].reduce((n, t) => n + t.length, 0)})</span></summary>
          {[...kinds.get(k)!.entries()].map(([t, trs]) => (
            <table key={t} className="list small speccard-table">
              <caption>{trs[0].table_title} <span className="muted">· {trs[0].manual_ref || trs[0].manual} p{trs[0].page}{trs[0].ocr ? ' · OCR' : ''}</span></caption>
              <tbody>
                {trs.map((r, i) => (
                  <tr key={i}><td>{r.label}</td>{r.value.split(' | ').map((c, j) => <td key={j} className="mono">{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          ))}
        </details>
      ))}
    </div>
  );
}

function FactRow({ label, source, children }: { label: string; source: string; children: React.ReactNode }) {
  return (<><dt>{label}</dt><dd title={source}>{children}</dd></>);
}
