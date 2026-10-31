'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Capture, Kind, Word } from '@/lib/catalog';

// Drag on the page to draw a box; the words inside it (from the PDF's own text, so
// exact) show on the right as lines, columns split by " | ". Pick what kind of fact
// it is, fix the text if needed, save. Saved boxes stay drawn; click one to edit.
// Keys: ← / → page, Esc drops the box.
type PageData = {
  page: number; pages: number; section: string; width: number; height: number;
  words: Word[]; captures: Capture[]; total: number;
};
type Box = { x0: number; y0: number; x1: number; y1: number };

const KIND_LABEL: Record<Kind, string> = {
  fitment: 'Fitment range', size: 'Size', stock_spec: 'Stock spec', supersession: 'Supersession', other: 'Other',
};
const KIND_COLOR: Record<Kind, string> = {
  fitment: '#d4a52c', size: '#6fae6a', stock_spec: '#5b9bd5', supersession: '#b07cc6', other: '#a39a86',
};
const OEM = /^(?:OEM#?)?(?!(?:19|20)\d\d-)(\d{4,5}-\d{2}[A-Z]{0,2}|\d{8})[.,;:)]?$/;

// Words whose centre is in the box -> lines (same top within 2.5pt), columns split by " | ".
function textIn(words: Word[], b: Box): string {
  const inBox = words.filter((w) => {
    const cx = (w[1] + w[2]) / 2, cy = (w[3] + w[4]) / 2;
    return cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1;
  }).sort((a, z) => a[3] - z[3] || a[1] - z[1]);
  const lines: Word[][] = [];
  for (const w of inBox) {
    const L = lines[lines.length - 1];
    if (L && Math.abs(L[0][3] - w[3]) < 2.5) L.push(w);
    else lines.push([w]);
  }
  return lines
    .map((L) => L.sort((a, z) => a[1] - z[1]).reduce((s, w, i) => (i === 0 ? w[0] : s + (w[1] - L[i - 1][2] > 9 ? ' | ' : ' ') + w[0]), ''))
    .join('\n');
}

export default function CatalogViewer({ catalog, title, sections, initialPage }: {
  catalog: string; title: string; sections: { from: number; name: string }[]; initialPage: number;
}) {
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState('');
  const [box, setBox] = useState<Box | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [kind, setKind] = useState<Kind>('fitment');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [edit, setEdit] = useState<Capture | null>(null);
  const [showNums, setShowNums] = useState(true);
  const [busy, setBusy] = useState(false);
  const [jump, setJump] = useState(String(initialPage));
  const imgWrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async (p: number) => {
    setError('');
    const r = await fetch(`/api/catalog/${catalog}/${p}`);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`); return; }
    setData(await r.json());
  }, [catalog]);

  useEffect(() => {
    setBox(null); setEdit(null); setText(''); setNote(''); setJump(String(page));
    window.history.replaceState(null, '', `/catalog?p=${page}`);
    load(page);
  }, [page, load]);

  const go = (p: number) => data && setPage(Math.min(Math.max(1, p), data.pages));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (e.key === 'ArrowRight') setPage((p) => (data ? Math.min(p + 1, data.pages) : p));
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1));
      if (e.key === 'Escape') { setBox(null); setEdit(null); setText(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data]);

  // mouse position -> PDF points
  const toPt = (e: React.MouseEvent) => {
    const r = imgWrap.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * data!.width, y: ((e.clientY - r.top) / r.height) * data!.height };
  };
  const onDown = (e: React.MouseEvent) => {
    if (!data || e.button !== 0) return;
    e.preventDefault();
    const p = toPt(e);
    setDrag(p); setEdit(null); setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const p = toPt(e);
    setBox({ x0: Math.min(drag.x, p.x), y0: Math.min(drag.y, p.y), x1: Math.max(drag.x, p.x), y1: Math.max(drag.y, p.y) });
  };
  const onUp = () => {
    if (!drag || !box || !data) return;
    setDrag(null);
    if (box.x1 - box.x0 < 4 || box.y1 - box.y0 < 4) { setBox(null); return; }
    setText(textIn(data.words, box));
  };

  const save = async () => {
    if (!data || !box || !text.trim()) return;
    setBusy(true);
    const r = await fetch('/api/catalog/captures', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ catalog, page: data.page, ...box, text, kind, note }),
    });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'save failed'); return; }
    setBox(null); setText(''); setNote('');
    load(data.page);
  };
  const saveEdit = async (patch: Partial<Capture>) => {
    if (!edit) return;
    setBusy(true);
    const r = await fetch('/api/catalog/captures', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ capture_id: edit.capture_id, ...patch }),
    });
    setBusy(false);
    if (r.ok) { setEdit(await r.json()); load(page); }
  };
  const remove = async (id: number) => {
    if (!confirm('Delete this capture?')) return;
    await fetch(`/api/catalog/captures?id=${id}`, { method: 'DELETE' });
    setEdit(null); load(page);
  };

  const pct = (b: Box) => data && {
    left: `${(b.x0 / data.width) * 100}%`, top: `${(b.y0 / data.height) * 100}%`,
    width: `${((b.x1 - b.x0) / data.width) * 100}%`, height: `${((b.y1 - b.y0) / data.height) * 100}%`,
  };
  const nums = useMemo(() => (data && showNums ? data.words.filter((w) => OEM.test(w[0])) : []), [data, showNums]);
  const sectionAt = sections.filter((s) => page >= s.from).pop()?.name;

  return (
    <div className="cat">
      <div className="cat-bar">
        <h1>Catalog</h1>
        <span className="muted">{title}</span>
        <button onClick={() => go(page - 1)} disabled={page <= 1}>◂ Prev</button>
        <form onSubmit={(e) => { e.preventDefault(); go(Number(jump)); }}>
          <input className="cat-jump" value={jump} onChange={(e) => setJump(e.target.value)} aria-label="Page" />
          <span className="muted"> / {data?.pages ?? '…'}</span>
        </form>
        <button onClick={() => go(page + 1)} disabled={!!data && page >= data.pages}>Next ▸</button>
        <select value={sectionAt} onChange={(e) => go(sections.find((s) => s.name === e.target.value)!.from)}>
          {sections.map((s) => <option key={s.from} value={s.name}>{s.name} (p{s.from})</option>)}
        </select>
        <label className="small"><input type="checkbox" checked={showNums} onChange={(e) => setShowNums(e.target.checked)} /> H-D numbers</label>
        <a className="small" href="/api/catalog/captures/export">Export CSV ({data?.total ?? 0})</a>
      </div>
      {error ? <p style={{ color: 'var(--red)' }}>{error}</p> : null}

      <div className="cat-main">
        <div className="cat-page" ref={imgWrap} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/catalog/${catalog}/${page}/image`} alt={`Page ${page}`} draggable={false} />
          {nums.map((w, i) => (
            <div key={i} className="cat-num" style={pct({ x0: w[1] - 1, y0: w[3] - 1, x1: w[2] + 1, y1: w[4] + 1 }) ?? undefined} />
          ))}
          {data?.captures.map((c) => (
            <div
              key={c.capture_id}
              className={`cat-cap${edit?.capture_id === c.capture_id ? ' on' : ''}`}
              style={{ ...pct(c), borderColor: KIND_COLOR[c.kind], background: `${KIND_COLOR[c.kind]}40` }}
              title={`${KIND_LABEL[c.kind]} #${c.capture_id}`}
              onMouseDown={(e) => { e.stopPropagation(); setBox(null); setEdit(c); }}
            />
          ))}
          {box ? <div className="cat-box" style={{ ...pct(box), borderColor: KIND_COLOR[kind] }} /> : null}
        </div>

        <aside className="cat-side">
          <div className="muted small">p{page} · {data?.section ?? ''} · {data?.captures.length ?? 0} on this page</div>
          {edit ? (
            <EditPanel c={edit} busy={busy} onSave={saveEdit} onDelete={() => remove(edit.capture_id)} onClose={() => setEdit(null)} />
          ) : box && !drag ? (
            <>
              <h2>New capture</h2>
              <div className="cat-kinds">
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <button key={k} className={k === kind ? 'on' : ''} style={{ borderColor: KIND_COLOR[k] }} onClick={() => setKind(k)}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <textarea className="mono" rows={Math.min(18, Math.max(4, text.split('\n').length + 1))} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="No PDF text in this box (picture?). Type what it says." />
              <input className="cat-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): what to pull from it" />
              <div className="cat-actions">
                <button className="primary" disabled={busy || !text.trim()} onClick={save}>Save capture</button>
                <button onClick={() => { setBox(null); setText(''); }}>Cancel</button>
              </div>
            </>
          ) : (
            <p className="muted">Drag a box over a table, row or sentence to document it. Click a saved box to edit it.</p>
          )}

          {data?.captures.length ? (
            <>
              <h2>On this page</h2>
              {data.captures.map((c) => (
                <button key={c.capture_id} className="cat-item" onClick={() => { setBox(null); setEdit(c); }}>
                  <span className="cat-dot" style={{ background: KIND_COLOR[c.kind] }} />
                  <span className="small">{KIND_LABEL[c.kind]} · {c.status}</span>
                  <span className="mono small cat-preview">{c.text.split('\n')[0]}</span>
                </button>
              ))}
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function EditPanel({ c, busy, onSave, onDelete, onClose }: {
  c: Capture; busy: boolean; onSave: (p: Partial<Capture>) => void; onDelete: () => void; onClose: () => void;
}) {
  const [text, setText] = useState(c.text);
  const [note, setNote] = useState(c.note);
  useEffect(() => { setText(c.text); setNote(c.note); }, [c]);
  return (
    <>
      <h2>Capture #{c.capture_id}</h2>
      <div className="cat-kinds">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button key={k} className={k === c.kind ? 'on' : ''} style={{ borderColor: KIND_COLOR[k] }} onClick={() => onSave({ kind: k })}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <textarea className="mono" rows={Math.min(18, Math.max(4, text.split('\n').length + 1))} value={text} onChange={(e) => setText(e.target.value)} />
      <input className="cat-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
      <div className="cat-actions">
        <button className="primary" disabled={busy} onClick={() => onSave({ text, note })}>Save</button>
        <select value={c.status} onChange={(e) => onSave({ status: e.target.value })}>
          {['new', 'reviewed', 'loaded', 'rejected'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <button onClick={onDelete}>Delete</button>
        <button onClick={onClose}>Close</button>
      </div>
    </>
  );
}
