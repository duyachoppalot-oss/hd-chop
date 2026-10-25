import Link from 'next/link';
import { query } from '@/lib/db';
import { NoteRow } from '@/components/Notes';
import { OVERRIDE_SELECT, OverrideList, type Override } from '@/components/OverrideList';
import { noteHref, noteTarget, type NoteWithTarget } from '@/lib/notes';

export const dynamic = 'force-dynamic';

export default async function Counter() {
  const [stats] = await query<Record<string, number>>(`
    SELECT (SELECT count(*) FROM vehicles)::int AS vehicles,
           (SELECT count(DISTINCT model_code) FROM vehicles)::int AS models,
           (SELECT count(*) FROM oem_parts)::int AS parts,
           (SELECT count(*) FROM oem_parts WHERE concept_id IS NOT NULL)::int AS parts_with_concept,
           (SELECT count(*) FROM fitment_spans)::int AS spans,
           (SELECT count(*) FROM admin_overrides WHERE active)::int AS overrides,
           (SELECT count(*) FROM admin_notes WHERE status = 'open')::int AS open_notes,
           (SELECT count(*) FROM admin_tasks WHERE owner = 'laken' AND status NOT IN ('done', 'parked'))::int AS my_tasks,
           (SELECT count(*) FROM fitment_hidden)::int AS hidden`);
  const sources = await query<{ source: string; confidence: string; n: number }>(
    `SELECT source, confidence, count(*)::int AS n FROM fitment GROUP BY 1, 2 ORDER BY 1, 2`
  );
  const platforms = await query<{ platform: string; models: string[]; y0: number; y1: number }>(`
    SELECT platform, array_agg(DISTINCT model_code ORDER BY model_code) AS models, min(year) AS y0, max(year) AS y1
    FROM vehicles v WHERE EXISTS (SELECT 1 FROM fitment f WHERE f.vehicle_id = v.vehicle_id)
    GROUP BY 1 ORDER BY min(year)`);
  const concepts = await query<{ slug: string; display_name: string; parts: number }>(`
    SELECT c.slug, c.display_name, count(p.*)::int AS parts
    FROM part_concepts c LEFT JOIN oem_parts p USING (concept_id) GROUP BY 1, 2 ORDER BY 2`);
  const misses = await query<{ query: string; n: number; last: Date }>(`
    SELECT lower(query) AS query, count(*)::int AS n, max(created_at) AS last
    FROM search_misses GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT 15`);
  const notes = await query<NoteWithTarget>(
    `SELECT * FROM admin_notes WHERE status = 'open' ORDER BY created_at DESC LIMIT 8`
  );
  const overrides = await query<Override>(`${OVERRIDE_SELECT} ORDER BY o.override_id DESC LIMIT 8`);

  return (
    <>
      <h1>Parts counter</h1>
      <p className="muted">Everything the app knows, from the hdchop database. Click a platform model, a concept, or search a part number.</p>
      <div className="stats">
        {[
          ['Vehicles', stats.vehicles],
          ['Model codes', stats.models],
          ['Parts', stats.parts],
          ['Parts with concept', stats.parts_with_concept],
          ['Fitment spans', stats.spans],
          ['Active overrides', stats.overrides],
          ['Hidden fitment rows', stats.hidden],
          ['Open notes', stats.open_notes],
          ['Your tasks', stats.my_tasks],
        ].map(([k, v]) => (
          <div key={k} className="panel stat">
            <b>{Number(v).toLocaleString()}</b>
            <span className="muted small">{k}</span>
          </div>
        ))}
      </div>

      <div className="cols" style={{ marginTop: 10 }}>
        <div>
          <h2>Models by platform</h2>
          {platforms.map((p) => (
            <div key={p.platform} style={{ marginBottom: 12 }}>
              <h3>
                {p.platform} <span className="muted small">{p.y0}–{p.y1}</span>
              </h3>
              <div className="chips" style={{ marginTop: 5 }}>
                {p.models.map((m) => (
                  <Link key={m} href={`/model/${m}`} className="chip">
                    {m}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <h2>Concepts</h2>
          <div className="chips">
            {concepts.map((c) => (
              <Link key={c.slug} href={`/concept/${c.slug}`} className="chip">
                {c.display_name} <span className="muted">{c.parts}</span>
              </Link>
            ))}
          </div>
          <h2>Fitment rows by source</h2>
          <table className="list" style={{ maxWidth: 520 }}>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source + s.confidence}>
                  <td>{s.source}</td>
                  <td className="muted">{s.confidence}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{s.n.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h2>Open notes</h2>
          <div className="panel">
            {notes.length ? (
              notes.map((n) => (
                <NoteRow key={n.note_id} n={n} back="/" context={<Link href={noteHref(n)}>{noteTarget(n)}</Link>} />
              ))
            ) : (
              <p className="muted small">None yet. Add notes from any part, model or concept page.</p>
            )}
            <Link href="/notes" className="small">All notes →</Link>
          </div>
          <h2>Recent overrides</h2>
          <div className="panel">
            <OverrideList items={overrides} back="/" showPart />
          </div>
          <h2>Searches that found nothing</h2>
          <div className="panel">
            {misses.length ? (
              <table className="list">
                <tbody>
                  {misses.map((m) => (
                    <tr key={m.query}>
                      <td>{m.query}</td>
                      <td className="mono muted">{m.n}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted small">No misses logged.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
