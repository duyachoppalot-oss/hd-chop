'use server';

import { revalidatePath } from 'next/cache';
import { MODEL_RE, normOem, query } from '@/lib/db';

// Every write ends in revalidatePath(back) so the page re-reads.
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const year = (v: string) => {
  if (!/^\d{4}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1903 && n <= 2030 ? n : null;
};

async function refreshSpans() {
  await query('REFRESH MATERIALIZED VIEW CONCURRENTLY fitment_spans');
}

// ---------- notes ----------

const KINDS = ['part', 'model', 'vehicle', 'concept', 'general'];

export async function addNote(f: FormData) {
  const kind = str(f, 'kind');
  const key = str(f, 'key');
  const body = str(f, 'body');
  if (!KINDS.includes(kind) || !body) return;
  await query(`INSERT INTO admin_notes (target_kind, target_key, body) VALUES ($1, $2, $3)`, [kind, key, body.slice(0, 4000)]);
  revalidatePath(str(f, 'back') || '/');
}

export async function setNoteStatus(f: FormData) {
  await query(`UPDATE admin_notes SET status = $2, updated_at = now() WHERE note_id = $1`, [
    Number(str(f, 'id')),
    str(f, 'status') === 'done' ? 'done' : 'open',
  ]);
  revalidatePath(str(f, 'back') || '/');
}

export async function deleteNote(f: FormData) {
  await query(`DELETE FROM admin_notes WHERE note_id = $1`, [Number(str(f, 'id'))]);
  revalidatePath(str(f, 'back') || '/');
}

// ---------- tasks ----------
// Any change saved here sets review = 'pending' so Claude picks it up (scripts/dev/notes.mjs).

const TASK_STATUS = ['open', 'doing', 'done', 'parked'];
const TASK_AREAS = ['Data', 'Specs', 'Search', 'Sources', 'App', 'Server'];

function taskFields(f: FormData) {
  const status = str(f, 'status');
  const area = str(f, 'area');
  const pri = Number(str(f, 'priority'));
  return {
    title: str(f, 'title').slice(0, 200),
    detail: str(f, 'detail').slice(0, 4000),
    note: str(f, 'note').slice(0, 4000),
    status: TASK_STATUS.includes(status) ? status : 'open',
    area: TASK_AREAS.includes(area) ? area : 'Data',
    priority: [1, 2, 3].includes(pri) ? pri : 2,
    owner: str(f, 'owner') === 'claude' ? 'claude' : 'laken',
  };
}

export async function saveTask(f: FormData) {
  const t = taskFields(f);
  if (!t.title) return;
  await query(
    `UPDATE admin_tasks SET title = $2, detail = $3, note = $4, status = $5, area = $6, priority = $7, owner = $8,
            review = 'pending', updated_at = now() WHERE task_id = $1`,
    [Number(str(f, 'id')), t.title, t.detail, t.note, t.status, t.area, t.priority, t.owner]
  );
  revalidatePath(str(f, 'back') || '/tasks');
}

export async function setTaskStatus(f: FormData) {
  const status = str(f, 'status');
  if (!TASK_STATUS.includes(status)) return;
  await query(`UPDATE admin_tasks SET status = $2, review = 'pending', updated_at = now() WHERE task_id = $1`, [Number(str(f, 'id')), status]);
  revalidatePath(str(f, 'back') || '/tasks');
}

export async function addTask(f: FormData) {
  const t = taskFields(f);
  if (!t.title) return;
  await query(
    `INSERT INTO admin_tasks (title, detail, note, status, area, priority, owner, review) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
    [t.title, t.detail, t.note, t.status, t.area, t.priority, t.owner]
  );
  revalidatePath('/tasks');
}

// ---------- overrides ----------

export type ActionState = { ok?: string; error?: string };

export async function addOverride(_prev: ActionState, f: FormData): Promise<ActionState> {
  const kind = str(f, 'kind');
  const oem = normOem(str(f, 'oem'));
  const reason = str(f, 'reason').slice(0, 500) || null;
  const part = (await query<{ oem_number: string }>(`SELECT oem_number FROM oem_parts WHERE oem_number = $1`, [oem]))[0];
  if (!part) return { error: `No part ${oem} in oem_parts.` };

  let model: string | null = null;
  let ys: number | null = null;
  let ye: number | null = null;
  let conditions: string[] = [];
  let value: string | null = null;

  if (kind === 'hide_fitment' || kind === 'add_fitment') {
    const m = str(f, 'model').toUpperCase();
    model = m && m !== '*' ? m : null;
    if (model && !MODEL_RE.test(model)) return { error: 'Bad model code.' };
    const a = str(f, 'year_start');
    const b = str(f, 'year_end');
    ys = a ? year(a) : null;
    ye = b ? year(b) : null;
    if ((a && ys == null) || (b && ye == null)) return { error: 'Years must be 1903–2030.' };
    if (ys != null && ye != null && ys > ye) return { error: 'From year is after to year.' };
    if (kind === 'add_fitment') {
      if (!model) return { error: 'Adding fitment needs a model code.' };
      if (ys == null && ye == null) return { error: 'Adding fitment needs years.' };
      ys ??= ye;
      ye ??= ys;
      const found = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM vehicles WHERE model_code = $1 AND year BETWEEN $2 AND $3`,
        [model, ys, ye]
      );
      if (!found[0].n) return { error: `No ${model} vehicles between ${ys} and ${ye}.` };
      conditions = f.getAll('conditions').map(String).filter(Boolean).sort();
      if (conditions.length) {
        const known = await query<{ tag: string }>(`SELECT tag FROM condition_tags WHERE tag = ANY($1)`, [conditions]);
        if (known.length !== conditions.length) return { error: 'Unknown condition tag.' };
      }
    }
  } else if (kind === 'rename_part') {
    value = str(f, 'value').slice(0, 160);
    if (!value) return { error: 'Name is empty.' };
  } else if (kind === 'set_concept') {
    value = str(f, 'value');
    if (value && !(await query(`SELECT 1 FROM part_concepts WHERE slug = $1`, [value])).length) return { error: 'Unknown concept.' };
  } else return { error: 'Unknown kind.' };

  const [{ override_id }] = await query<{ override_id: number }>(
    `INSERT INTO admin_overrides (kind, oem_number, model_code, year_start, year_end, conditions, value, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING override_id`,
    [kind, oem, model, ys, ye, conditions, value, reason]
  );
  const [{ n }] = await query<{ n: number }>(`SELECT admin_apply_override($1) AS n`, [override_id]);
  await refreshSpans();
  revalidatePath(str(f, 'back') || '/');
  return { ok: `Override #${override_id} applied: ${n} rows.` };
}

export async function undoOverride(f: FormData) {
  await query(`SELECT admin_undo_override($1)`, [Number(str(f, 'id'))]);
  await refreshSpans();
  revalidatePath(str(f, 'back') || '/overrides');
}

export async function reactivateOverride(f: FormData) {
  const id = Number(str(f, 'id'));
  await query(`UPDATE admin_overrides SET active = true WHERE override_id = $1`, [id]);
  await query(`SELECT admin_apply_override($1)`, [id]);
  await refreshSpans();
  revalidatePath(str(f, 'back') || '/overrides');
}

export async function deleteOverride(f: FormData) {
  // Only undone overrides can be deleted, so nothing is left half-applied.
  await query(`DELETE FROM admin_overrides WHERE override_id = $1 AND NOT active`, [Number(str(f, 'id'))]);
  revalidatePath(str(f, 'back') || '/overrides');
}

export async function reapplyAll() {
  await query(`SELECT * FROM admin_apply_overrides()`);
  await refreshSpans();
  revalidatePath('/overrides');
}
