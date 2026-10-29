import Link from 'next/link';
import { normOem } from '@/lib/db';
import { apiGet } from '@/lib/localApi';

export const dynamic = 'force-dynamic';

// Search by family (same as the app: /v1/family-search on the local API).
// Pick a frame (platform) or motor (engine) family, type part words, see every
// part with the models + years it fits inside that family.
type Family = { key: string; name: string; kind: 'frame' | 'motor'; year_start: number; year_end: number; models: number };
type Span = { model_code: string; model_name: string | null; family: string | null; year_start: number; year_end: number };
type Part = {
  oem: string;
  replaces: string[];
  description: string | null;
  conditions: string[];
  condition_source: string;
  year_start: number;
  year_end: number;
  spans: Span[];
};
type Resp = {
  query: string;
  page_size: number;
  offset: number;
  concepts: { slug: string; display_name: string; match: string }[];
  results: { concept: { slug: string; display_name: string }; total: number; parts: Part[] }[];
  fallback: Part[] | null;
};

const yr = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

// Spans grouped by exact year range, oldest first; the models under each range
// fold away (<details>) so a part reads as its ranges.
function ranges(spans: Span[]) {
  const out = new Map<string, { key: string; a: number; b: number; years: string; models: Span[] }>();
  for (const s of spans) {
    const key = `${s.year_start}-${s.year_end}`;
    if (!out.has(key)) out.set(key, { key, a: s.year_start, b: s.year_end, years: yr(s.year_start, s.year_end), models: [] });
    const r = out.get(key)!;
    if (!r.models.some((m) => m.model_code === s.model_code)) r.models.push(s);
  }
  return [...out.values()].sort((x, y) => x.a - y.a || x.b - y.b);
}

export default async function FamilySearch({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const family = sp.family ?? '';
  const q = (sp.q ?? '').trim();
  const from = sp.from ?? '';
  const to = sp.to ?? '';
  const offset = Number(sp.offset ?? 0) || 0;

  const fams = await apiGet<{ families: Family[] }>('/v1/families');
  const qs = (o: number) =>
    `family=${encodeURIComponent(family)}&q=${encodeURIComponent(q)}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}${o ? `&offset=${o}` : ''}`;
  const res = family && q ? await apiGet<Resp>(`/v1/family-search?${qs(offset)}`) : null;
  const fam = fams.ok ? fams.body.families.find((f) => f.key === family) : undefined;

  return (
    <>
      <h1>Family search</h1>
      {!fams.ok ? <p style={{ color: 'var(--red)' }}>{fams.error}</p> : null}
      <form className="filters" action="/family">
        <select name="family" defaultValue={family}>
          <option value="">Family…</option>
          {(['frame', 'motor'] as const).map((k) => (
            <optgroup key={k} label={k === 'frame' ? 'Frame' : 'Motor'}>
              {(fams.ok ? fams.body.families : [])
                .filter((f) => f.kind === k)
                .map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.name} ({yr(f.year_start, f.year_end)}, {f.models} models)
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <input name="q" defaultValue={q} placeholder="gas tank, turn signals…" style={{ width: 240 }} />
        <input name="from" defaultValue={from} placeholder="from year" style={{ width: 90 }} />
        <input name="to" defaultValue={to} placeholder="to year" style={{ width: 90 }} />
        <button type="submit">Search</button>
      </form>

      {res && !res.ok ? <p style={{ color: 'var(--red)' }}>{res.error}</p> : null}
      {res?.ok ? (
        <>
          {res.body.results.map((r) => (
            <section key={r.concept.slug}>
              <h2>
                <Link href={`/concept/${r.concept.slug}`}>{r.concept.display_name}</Link>{' '}
                <span className="muted small">
                  {r.total} parts on {fam?.name ?? family}
                  {from || to ? ` ${from || '…'}–${to || '…'}` : ''}
                  {res.body.concepts[0]?.match === 'trigram' ? ' · closest concept match' : ''}
                  {r.total > res.body.page_size ? ` · showing ${offset + 1}–${Math.min(offset + res.body.page_size, r.total)}` : ''}
                </span>
              </h2>
              <PartGrid parts={r.parts} />
            </section>
          ))}
          {res.body.results.some((r) => r.total > res.body.page_size) ? (
            <div className="row">
              {offset > 0 ? <Link href={`/family?${qs(Math.max(0, offset - res.body.page_size))}`}>‹ Previous</Link> : null}
              {res.body.results.some((r) => r.total > offset + res.body.page_size) ? (
                <Link href={`/family?${qs(offset + res.body.page_size)}`}>Next ›</Link>
              ) : null}
            </div>
          ) : null}
          {res.body.fallback ? (
            <section>
              <h2>
                No concept for “{res.body.query}” <span className="muted small">closest part names (logged to search_misses)</span>
              </h2>
              {res.body.fallback.length ? <PartGrid parts={res.body.fallback} /> : <p className="muted">Nothing close.</p>}
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function PartGrid({ parts }: { parts: Part[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: 12 }}>
      {parts.map((p) => (
        <div key={`${p.oem}|${p.conditions.join(',')}`} className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Link href={`/part/${normOem(p.oem)}`} className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
              {p.oem}
            </Link>
            <span className="mono muted">{yr(p.year_start, p.year_end)}</span>
          </div>
          <div>{p.description ?? <span className="muted">(no name)</span>}</div>
          {p.conditions.length ? (
            <div className="chips" style={{ margin: '4px 0' }}>
              {p.conditions.map((c) => (
                <span key={c} className="chip on">{c}</span>
              ))}
              <span className="muted small">{p.condition_source}</span>
            </div>
          ) : null}
          <div style={{ marginTop: 6 }}>
            {ranges(p.spans).map((r) =>
              r.models.length === 1 ? (
                <div key={r.key} className="rng">
                  <span className="mono rng-y">{r.years}</span>
                  <span>
                    <Link href={`/model/${r.models[0].model_code}`} className="mono">{r.models[0].model_code}</Link>{' '}
                    {r.models[0].model_name ?? ''}
                  </span>
                </div>
              ) : (
                <details key={r.key}>
                  <summary className="rng">
                    <span className="mono rng-y">{r.years}</span>
                    <span className="muted">{r.models.length} models</span>
                  </summary>
                  <table className="list" style={{ marginLeft: 18, width: 'calc(100% - 18px)' }}>
                    <tbody>
                      {r.models.map((m) => (
                        <tr key={m.model_code}>
                          <td className="mono"><Link href={`/model/${m.model_code}`}>{m.model_code}</Link></td>
                          <td>{m.model_name ?? ''}</td>
                          <td className="muted small">{m.family ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )
            )}
          </div>
          {p.replaces.length ? <div className="muted small mono">Replaces {p.replaces.join(', ')}</div> : null}
        </div>
      ))}
    </div>
  );
}
