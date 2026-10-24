'use client';

import { useActionState, useState } from 'react';
import { addOverride, type ActionState } from '@/app/actions';

type Props = {
  back: string;
  members: { oem_number: string; oem_display: string; description: string | null; concept: string | null }[];
  models: string[]; // models this chain fits now, for the hide picker
  allModels: string[];
  concepts: { slug: string; display_name: string }[];
  tags: { tag: string; label: string }[];
};

const KINDS = [
  ['hide_fitment', 'Hide years'],
  ['add_fitment', 'Add years'],
  ['rename_part', 'Rename'],
  ['set_concept', 'Concept'],
] as const;

// One form, four kinds of fix. Each saves an override, applies it and
// refreshes fitment_spans (several seconds).
export function OverrideForms({ back, members, models, allModels, concepts, tags }: Props) {
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('hide_fitment');
  const [oem, setOem] = useState(members[0]?.oem_number ?? '');
  const [state, action, pending] = useActionState<ActionState, FormData>(addOverride, {});
  const member = members.find((m) => m.oem_number === oem);

  return (
    <div className="panel">
      <h3>Fix this part</h3>
      <div className="chips" style={{ margin: '10px 0' }}>
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" className={kind === k ? '' : 'ghost'} onClick={() => setKind(k)} style={{ padding: '4px 10px' }}>
            {label}
          </button>
        ))}
      </div>
      <form action={action} className="form-grid" key={kind}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="back" value={back} />
        <label>
          Part number
          <select name="oem" value={oem} onChange={(e) => setOem(e.target.value)}>
            {members.map((m) => (
              <option key={m.oem_number} value={m.oem_number}>
                {m.oem_display} {m.description ? `· ${m.description}` : ''}
              </option>
            ))}
          </select>
        </label>

        {kind === 'hide_fitment' || kind === 'add_fitment' ? (
          <>
            <label>
              Model
              {kind === 'hide_fitment' ? (
                <select name="model" defaultValue="*">
                  <option value="*">All models</option>
                  {models.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input name="model" list="all-models" placeholder="FLHR" required />
                  <datalist id="all-models">
                    {allModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </>
              )}
            </label>
            <div className="row">
              <label>
                From
                <input name="year_start" size={5} placeholder={kind === 'hide_fitment' ? 'any' : '1999'} />
              </label>
              <label>
                To
                <input name="year_end" size={5} placeholder={kind === 'hide_fitment' ? 'any' : '2003'} />
              </label>
            </div>
            {kind === 'add_fitment' ? (
              <div className="chips">
                {tags.map((t) => (
                  <label key={t.tag} className="chip" style={{ display: 'inline-flex', gap: 4 }}>
                    <input type="checkbox" name="conditions" value={t.tag} style={{ padding: 0 }} /> {t.label}
                  </label>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {kind === 'rename_part' ? (
          <label>
            New name
            <input name="value" defaultValue={member?.description ?? ''} required />
          </label>
        ) : null}

        {kind === 'set_concept' ? (
          <label>
            Concept
            <select name="value" defaultValue={member?.concept ?? ''}>
              <option value="">(none)</option>
              {concepts.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          Reason (for the log)
          <input name="reason" placeholder="e.g. 1980 FX catalog p.42 says…" />
        </label>
        <div className="row">
          <button type="submit" disabled={pending}>
            {pending ? 'Applying…' : 'Save + apply'}
          </button>
          {state.ok ? <span className="small" style={{ color: 'var(--green)' }}>{state.ok}</span> : null}
          {state.error ? <span className="small" style={{ color: 'var(--red)' }}>{state.error}</span> : null}
        </div>
      </form>
    </div>
  );
}
