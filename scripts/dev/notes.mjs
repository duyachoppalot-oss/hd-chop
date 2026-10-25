// scripts/dev/notes.mjs — read-only: what Laken left in the admin console.
// Lists open admin notes (newest first) with the current state of their target,
// and overrides created or changed in the last 14 days.
//   node scripts/dev/notes.mjs
//   node scripts/dev/notes.mjs --all     include done notes

import 'dotenv/config';
import pg from 'pg';

const ALL = process.argv.includes('--all');
const c = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
await c.connect();

const notes = (
  await c.query(
    `SELECT note_id, target_kind, target_key, body, status, to_char(created_at, 'YYYY-MM-DD') AS day FROM admin_notes
     ${ALL ? '' : `WHERE status = 'open'`} ORDER BY created_at DESC`
  )
).rows;
console.log(`${notes.length} ${ALL ? '' : 'open '}admin note(s)`);
for (const n of notes) {
  let target = n.target_key || '(general)';
  if (n.target_kind === 'part') {
    const p = (await c.query(`SELECT oem_display, description_clean FROM oem_parts WHERE oem_number = $1`, [n.target_key])).rows[0];
    target = p ? `${p.oem_display} "${p.description_clean ?? ''}"` : `${n.target_key} (no such part now)`;
  }
  console.log(`  #${n.note_id} ${n.day} ${n.status} ${n.target_kind} ${target}\n      ${n.body.replace(/\n/g, '\n      ')}`);
}

const ov = (
  await c.query(
    `SELECT override_id, kind, oem_number, model_code, year_start, year_end, value, active, last_result, to_char(created_at, 'YYYY-MM-DD') AS day
     FROM admin_overrides WHERE created_at > now() - interval '14 days' OR applied_at > now() - interval '14 days' ORDER BY override_id DESC`
  )
).rows;
console.log(`\n${ov.length} override(s) created or applied in the last 14 days`);
for (const o of ov)
  console.log(`  #${o.override_id} ${o.day} ${o.kind} ${o.oem_number}${o.model_code ? ` ${o.model_code}` : ''}${o.year_start ? ` ${o.year_start}-${o.year_end}` : ''}${o.value != null ? ` -> "${o.value}"` : ''} ${o.active ? 'active' : 'inactive'} (${o.last_result ?? 'not applied'})`);
await c.end();
