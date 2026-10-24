import { deleteOverride, reactivateOverride, undoOverride } from '@/app/actions';
import Link from 'next/link';

export type Override = {
  override_id: number;
  kind: string;
  oem_number: string;
  oem_display: string | null;
  model_code: string | null;
  year_start: number | null;
  year_end: number | null;
  conditions: string[];
  value: string | null;
  original: string | null;
  reason: string | null;
  active: boolean;
  created_at: Date;
  last_result: string | null;
};

export const OVERRIDE_SELECT = `
  SELECT o.*, p.oem_display FROM admin_overrides o LEFT JOIN oem_parts p USING (oem_number)`;

const LABEL: Record<string, string> = {
  hide_fitment: 'Hide fitment',
  add_fitment: 'Add fitment',
  rename_part: 'Rename',
  set_concept: 'Set concept',
};

export function describe(o: Override): string {
  const years =
    o.year_start != null || o.year_end != null ? ` ${o.year_start ?? '…'}–${o.year_end ?? '…'}` : ' all years';
  switch (o.kind) {
    case 'hide_fitment':
      return `${o.model_code ?? 'all models'}${years}`;
    case 'add_fitment':
      return `${o.model_code}${years}${o.conditions.length ? ` {${o.conditions.join(', ')}}` : ''}`;
    case 'rename_part':
      return `"${o.original ?? '?'}" → "${o.value}"`;
    default:
      return `${o.original || 'none'} → ${o.value || 'none'}`;
  }
}

export function OverrideList({ items, back, showPart = false }: { items: Override[]; back: string; showPart?: boolean }) {
  if (!items.length) return <p className="muted small">No overrides.</p>;
  return (
    <table className="list">
      <thead>
        <tr>
          <th>#</th>
          {showPart ? <th>Part</th> : null}
          <th>Change</th>
          <th>Reason</th>
          <th>Result</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((o) => (
          <tr key={o.override_id} style={o.active ? undefined : { opacity: 0.55 }}>
            <td className="mono">{o.override_id}</td>
            {showPart ? (
              <td>
                <Link href={`/part/${o.oem_number}`} className="mono">
                  {o.oem_display ?? o.oem_number}
                </Link>
              </td>
            ) : null}
            <td>
              <b>{LABEL[o.kind]}</b> {showPart ? null : <span className="mono">{o.oem_display ?? o.oem_number} </span>}
              {describe(o)}
            </td>
            <td className="small">{o.reason}</td>
            <td className="small muted">{o.active ? o.last_result : 'undone'}</td>
            <td>
              <div className="row">
                {o.active ? (
                  <form action={undoOverride}>
                    <input type="hidden" name="id" value={o.override_id} />
                    <input type="hidden" name="back" value={back} />
                    <button className="ghost">Undo</button>
                  </form>
                ) : (
                  <>
                    <form action={reactivateOverride}>
                      <input type="hidden" name="id" value={o.override_id} />
                      <input type="hidden" name="back" value={back} />
                      <button className="ghost">Re-apply</button>
                    </form>
                    <form action={deleteOverride}>
                      <input type="hidden" name="id" value={o.override_id} />
                      <input type="hidden" name="back" value={back} />
                      <button className="danger">Delete</button>
                    </form>
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
