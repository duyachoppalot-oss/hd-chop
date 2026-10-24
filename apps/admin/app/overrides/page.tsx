import { reapplyAll } from '@/app/actions';
import { query } from '@/lib/db';
import { OVERRIDE_SELECT, OverrideList, type Override } from '@/components/OverrideList';

export const dynamic = 'force-dynamic';

export default async function OverridesPage() {
  const items = await query<Override>(`${OVERRIDE_SELECT} ORDER BY o.active DESC, o.override_id DESC`);
  return (
    <>
      <h1>Overrides</h1>
      <p className="muted">
        Hand fixes on top of the ETL output. The ETL re-applies the active ones at the end of every rebuild
        (<code>node scripts/etl/08_overrides.mjs --apply</code>). Undo puts the data back; undone overrides can be re-applied or deleted.
      </p>
      <form action={reapplyAll} style={{ margin: '12px 0' }}>
        <button className="ghost">Re-apply all + refresh spans</button>
      </form>
      <div className="panel">
        <OverrideList items={items} back="/overrides" showPart />
      </div>
    </>
  );
}
