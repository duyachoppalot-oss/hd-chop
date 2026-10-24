import { addNote, deleteNote, setNoteStatus } from '@/app/actions';
import { query } from '@/lib/db';

type Note = { note_id: number; body: string; status: string; created_at: Date };

// Notes pinned to one thing (a part, model, vehicle, concept). `back` is the
// page to re-render after a write.
export async function Notes({ kind, target, back, title = 'Notes' }: { kind: string; target: string; back: string; title?: string }) {
  const notes = await query<Note>(
    `SELECT note_id, body, status, created_at FROM admin_notes
     WHERE target_kind = $1 AND target_key = $2 ORDER BY status = 'done', created_at DESC`,
    [kind, target]
  );
  return (
    <div className="panel">
      <h3>{title}</h3>
      {notes.map((n) => (
        <NoteRow key={n.note_id} n={n} back={back} />
      ))}
      <form action={addNote} className="form-grid" style={{ marginTop: 10 }}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="key" value={target} />
        <input type="hidden" name="back" value={back} />
        <textarea name="body" rows={3} placeholder="Add a note…" required />
        <div>
          <button type="submit">Add note</button>
        </div>
      </form>
    </div>
  );
}

export function NoteRow({ n, back, context }: { n: Note; back: string; context?: React.ReactNode }) {
  return (
    <div className={`note${n.status === 'done' ? ' done' : ''}`}>
      {context ? <div className="small">{context}</div> : null}
      <p>{n.body}</p>
      <div className="row small muted">
        {new Date(n.created_at).toLocaleString()}
        <form action={setNoteStatus}>
          <input type="hidden" name="id" value={n.note_id} />
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="status" value={n.status === 'done' ? 'open' : 'done'} />
          <button className="ghost" style={{ padding: '2px 8px', fontSize: 11 }}>
            {n.status === 'done' ? 'Reopen' : 'Done'}
          </button>
        </form>
        <form action={deleteNote}>
          <input type="hidden" name="id" value={n.note_id} />
          <input type="hidden" name="back" value={back} />
          <button className="danger" style={{ padding: '2px 8px', fontSize: 11 }}>
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}
