import Link from 'next/link';
import { query } from '@/lib/db';
import { Notes, NoteRow } from '@/components/Notes';
import { noteHref, noteTarget, type NoteWithTarget } from '@/lib/notes';

export const dynamic = 'force-dynamic';

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status === 'done' ? 'done' : (await searchParams).status === 'all' ? 'all' : 'open';
  const notes = await query<NoteWithTarget>(
    `SELECT * FROM admin_notes WHERE $1 = 'all' OR status = $1 ORDER BY created_at DESC LIMIT 500`,
    [status]
  );
  return (
    <>
      <h1>Notes</h1>
      <div className="chips filters">
        {['open', 'done', 'all'].map((s) => (
          <Link key={s} href={`/notes?status=${s}`} className={`chip${s === status ? ' on' : ''}`}>{s}</Link>
        ))}
      </div>
      <div className="cols">
        <div className="panel">
          {notes.length ? (
            notes.map((n) => (
              <NoteRow key={n.note_id} n={n} back="/notes" context={<Link href={noteHref(n)}>{noteTarget(n)}</Link>} />
            ))
          ) : (
            <p className="muted">No {status === 'all' ? '' : status} notes.</p>
          )}
        </div>
        <Notes kind="general" target="" back="/notes" title="General note" />
      </div>
    </>
  );
}
