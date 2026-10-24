import Link from 'next/link';
import { redirect } from 'next/navigation';
import { normOem, query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Find({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim();
  if (!q) redirect('/');
  const key = normOem(q);

  const exact = await query<{ oem_number: string }>(`SELECT oem_number FROM oem_parts WHERE oem_number = $1`, [key]);
  const model = await query<{ model_code: string }>(`SELECT DISTINCT model_code FROM vehicles WHERE model_code = $1`, [key]);
  if (exact.length && !model.length) redirect(`/part/${exact[0].oem_number}`);
  if (model.length && !exact.length) redirect(`/model/${model[0].model_code}`);

  const parts = await query<{ oem_number: string; oem_display: string; description_clean: string | null; slug: string | null }>(
    `SELECT p.oem_number, p.oem_display, p.description_clean, c.slug
     FROM oem_parts p LEFT JOIN part_concepts c USING (concept_id)
     WHERE p.oem_number LIKE $1 || '%' OR p.description_clean ILIKE '%' || $2 || '%'
     ORDER BY p.oem_number LIKE $1 || '%' DESC, similarity(p.description_clean, $2) DESC NULLS LAST
     LIMIT 80`,
    [key, q]
  );
  const models = await query<{ model_code: string; model_name: string | null; y0: number; y1: number }>(
    `SELECT model_code, max(model_name) AS model_name, min(year) AS y0, max(year) AS y1 FROM vehicles
     WHERE model_code ILIKE $1 || '%' OR model_name ILIKE '%' || $1 || '%' GROUP BY 1 ORDER BY 1 LIMIT 40`,
    [q]
  );
  const concepts = await query<{ slug: string; display_name: string }>(
    `SELECT slug, display_name FROM part_concepts
     WHERE slug ILIKE '%' || $1 || '%' OR display_name ILIKE '%' || $1 || '%'
        OR EXISTS (SELECT 1 FROM unnest(user_terms || hd_terms) t WHERE t ILIKE '%' || $1 || '%')
     ORDER BY display_name`,
    [q]
  );

  return (
    <>
      <h1>“{q}”</h1>
      {concepts.length ? (
        <>
          <h2>Concepts</h2>
          <div className="chips">
            {concepts.map((c) => (
              <Link key={c.slug} href={`/concept/${c.slug}`} className="chip">{c.display_name}</Link>
            ))}
          </div>
        </>
      ) : null}
      {models.length ? (
        <>
          <h2>Models</h2>
          <div className="chips">
            {models.map((m) => (
              <Link key={m.model_code} href={`/model/${m.model_code}`} className="chip">
                {m.model_code} {m.model_name ? `· ${m.model_name}` : ''} <span className="muted">{m.y0}–{m.y1}</span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
      <h2>Parts</h2>
      {parts.length ? (
        <table className="list">
          <tbody>
            {parts.map((p) => (
              <tr key={p.oem_number}>
                <td className="mono"><Link href={`/part/${p.oem_number}`}>{p.oem_display}</Link></td>
                <td>{p.description_clean}</td>
                <td className="muted small">{p.slug}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">No parts match.</p>
      )}
    </>
  );
}
