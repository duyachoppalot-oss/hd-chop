import Link from 'next/link';
import { reapplyAll } from '@/app/actions';
import { query } from '@/lib/db';
import { OVERRIDE_SELECT, OverrideList, type Override } from '@/components/OverrideList';

export const dynamic = 'force-dynamic';

// ?kind=rename_part|set_concept|hide_fitment|add_fitment and ?reason=<prefix>
// narrow the list (tasks link here, e.g. ?reason=ocr_names for the automatic
// name fixes). At most 300 shown.
const KINDS: Record<string, string> = { rename_part: 'Renames', set_concept: 'Concepts', hide_fitment: 'Hidden fitment', add_fitment: 'Added fitment' };

export default async function OverridesPage({ searchParams }: { searchParams: Promise<{ kind?: string; reason?: string }> }) {
  const sp = await searchParams;
  const kind = sp.kind && KINDS[sp.kind] ? sp.kind : null;
  const reason = sp.reason?.trim() || null;
  const where = `WHERE ($1::text IS NULL OR o.kind = $1) AND ($2::text IS NULL OR o.reason LIKE $2 || '%')`;
  const items = await query<Override>(`${OVERRIDE_SELECT} ${where} ORDER BY o.active DESC, o.override_id DESC LIMIT 300`, [kind, reason]);
  const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM admin_overrides o ${where}`, [kind, reason]);
  const href = (k: string | null, r: string | null) => `/overrides${k || r ? '?' : ''}${[k && `kind=${k}`, r && `reason=${encodeURIComponent(r)}`].filter(Boolean).join('&')}`;
  return (
    <>
      <h1>Overrides</h1>
      <p className="muted">
        Hand fixes on top of the ETL output. The ETL re-applies the active ones at the end of every rebuild
        (<code>node scripts/etl/08_overrides.mjs --apply</code>). Undo puts the data back; undone overrides can be re-applied or deleted.
      </p>
      <div className="chips filters">
        <Link href={href(null, reason)} className={`chip${!kind ? ' on' : ''}`}>All kinds</Link>
        {Object.entries(KINDS).map(([k, l]) => (
          <Link key={k} href={href(k, reason)} className={`chip${k === kind ? ' on' : ''}`}>{l}</Link>
        ))}
        {reason ? <Link href={href(kind, null)} className="chip on">reason: {reason} ✕</Link> : null}
        <span className="muted small">{n.toLocaleString()} match{n > items.length ? `, showing ${items.length}` : ''}</span>
      </div>
      <form action={reapplyAll} style={{ margin: '12px 0' }}>
        <button className="ghost">Re-apply all + refresh spans</button>
      </form>
      <div className="panel">
        <OverrideList items={items} back={href(kind, reason)} showPart />
      </div>
    </>
  );
}
