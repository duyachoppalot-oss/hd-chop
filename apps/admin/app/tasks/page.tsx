import Link from 'next/link';
import { query } from '@/lib/db';
import { addTask, saveTask, setTaskStatus } from '@/app/actions';

export const dynamic = 'force-dynamic';

type Task = {
  task_id: number; title: string; detail: string; area: string; owner: string; status: string;
  priority: number; link: string | null; note: string; reply: string; review: string; updated_at: Date;
};

const AREAS = ['Data', 'Specs', 'Search', 'Sources', 'App', 'Server'];
const STATUS: Record<string, string> = { open: 'Open', doing: 'Doing', done: 'Done', parked: 'Parked' };
const PRI: Record<number, string> = { 1: 'High', 2: 'Normal', 3: 'Low' };
const SHOW: Record<string, { label: string; where: string }> = {
  mine: { label: 'Yours', where: `owner = 'laken' AND status NOT IN ('done', 'parked')` },
  claude: { label: "Claude's", where: `owner = 'claude' AND status NOT IN ('done', 'parked')` },
  review: { label: 'Waiting for review', where: `review = 'pending'` },
  done: { label: 'Done', where: `status IN ('done', 'parked')` },
  all: { label: 'All', where: 'true' },
};

// A link is an admin path ("/part/6808655") or a repo file ("reports/name_review.csv").
function TaskLink({ link }: { link: string | null }) {
  if (!link) return null;
  return link.startsWith('/') ? <Link href={link}>{link}</Link> : <code>{link}</code>;
}

function TaskForm({ t }: { t?: Task }) {
  return (
    <form action={t ? saveTask : addTask} className="form-grid">
      {t ? <input type="hidden" name="id" value={t.task_id} /> : null}
      <input type="hidden" name="back" value="/tasks" />
      <label>Title<input name="title" defaultValue={t?.title} required maxLength={200} /></label>
      <label>Details<textarea name="detail" rows={3} defaultValue={t?.detail} /></label>
      <label>Your note for Claude<textarea name="note" rows={2} defaultValue={t?.note} placeholder="What you found, what should change" /></label>
      <div className="row">
        <label>Status<select name="status" defaultValue={t?.status ?? 'open'}>{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Area<select name="area" defaultValue={t?.area ?? 'Data'}>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label>Priority<select name="priority" defaultValue={String(t?.priority ?? 2)}>{Object.entries(PRI).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Who<select name="owner" defaultValue={t?.owner ?? 'laken'}><option value="laken">Laken</option><option value="claude">Claude</option></select></label>
      </div>
      <div><button type="submit">{t ? 'Save for review' : 'Add task'}</button></div>
    </form>
  );
}

function TaskCard({ t }: { t: Task }) {
  return (
    <div className={`task ${t.status}${t.review === 'pending' ? ' pending' : ''}`}>
      <div className="row">
        <span className="t-title">{t.title}</span>
        <span className={`pill ${t.status}`}>{STATUS[t.status]}</span>
        {t.owner === 'claude' ? <span className="pill claude">Claude</span> : null}
        {t.review === 'pending' ? <span className="pill pending">Waiting for review</span> : null}
        <span className="muted small">{PRI[t.priority]} priority</span>
      </div>
      {t.detail ? <p className="muted">{t.detail}</p> : null}
      {t.link ? <div className="small"><TaskLink link={t.link} /></div> : null}
      {t.note ? <p className="t-note">You: {t.note}</p> : null}
      {t.reply ? <p className="t-reply small">Claude: {t.reply}</p> : null}
      <div className="row small">
        {t.status !== 'done' ? (
          <form action={setTaskStatus}>
            <input type="hidden" name="id" value={t.task_id} />
            <input type="hidden" name="status" value={t.status === 'open' ? 'doing' : 'done'} />
            <button className="ghost" style={{ padding: '2px 8px', fontSize: 11 }}>{t.status === 'open' ? 'Start' : 'Mark done'}</button>
          </form>
        ) : null}
        <span className="muted">updated {new Date(t.updated_at).toLocaleString()}</span>
      </div>
      <details>
        <summary>Edit</summary>
        <TaskForm t={t} />
      </details>
    </div>
  );
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const show = (await searchParams).show ?? 'mine';
  const f = SHOW[show] ?? SHOW.mine;
  const tasks = await query<Task>(`SELECT * FROM admin_tasks WHERE ${f.where} ORDER BY status = 'done', priority, task_id`);
  const counts = (await query<Record<string, number>>(`
    SELECT ${Object.entries(SHOW).map(([k, v]) => `count(*) FILTER (WHERE ${v.where})::int AS ${k}`).join(', ')} FROM admin_tasks`))[0];
  const areas = [...AREAS, ...new Set(tasks.map((t) => t.area).filter((a) => !AREAS.includes(a)))];
  return (
    <>
      <h1>Tasks</h1>
      <p className="muted">Work for you and for Claude. Save a change and it is flagged for Claude to review; Claude answers on the task.</p>
      <div className="chips filters">
        {Object.entries(SHOW).map(([k, v]) => (
          <Link key={k} href={`/tasks?show=${k}`} className={`chip${k === show ? ' on' : ''}`}>{v.label} {counts[k]}</Link>
        ))}
      </div>
      <div className="cols">
        <div className="tasks">
          {tasks.length ? areas.map((a) => {
            const list = tasks.filter((t) => t.area === a);
            return list.length ? (
              <section key={a} className="task-area">
                <h2>{a}</h2>
                {list.map((t) => <TaskCard key={t.task_id} t={t} />)}
              </section>
            ) : null;
          }) : <p className="muted">Nothing here.</p>}
        </div>
        <div className="panel">
          <h3>Add a task</h3>
          <TaskForm />
        </div>
      </div>
    </>
  );
}
