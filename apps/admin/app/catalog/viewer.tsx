'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Capture, Kind } from '@/lib/catalog';
import type { Suggestion } from '@/lib/catalogSuggest';
import { textIn, type Box, type Word } from '@/lib/catalogText';

// Catalog page with suggested boxes (dashed, numbered): each is a run of year/model lines
// with the heading above as its part name. Enter accepts the bright one (and moves to the
// next), Esc skips it for good. Drag anywhere to draw your own box instead. The words in a
// box come from the PDF's own text (columns split by " | "); fix them if needed.
// Saved boxes stay drawn; click one to edit. Keys: ← / → page, Shift+Enter = new line.
type PageData = {
  page: number; pages: number; section: string; width: number; height: number;
  words: Word[]; captures: Capture[]; suggestions: Suggestion[]; skipped: number; total: number;
};

const KIND_LABEL: Record<Kind, string> = {
  fitment: 'Fitment range', size: 'Size', stock_spec: 'Stock spec', supersession: 'Supersession', other: 'Other',
};
const KIND_COLOR: Record<Kind, string> = {
  fitment: '#d4a52c', size: '#6fae6a', stock_spec: '#5b9bd5', supersession: '#b07cc6', other: '#a39a86',
};
const OEM = /^(?:OEM#?)?(?!(?:19|20)\d\d-)(\d{4,5}-\d{2}[A-Z]{0,2}|\d{8})[.,;:)]?$/;

export default function CatalogViewer({ catalog, title, sections, initialPage }: {
  catalog: string; title: string; sections: { from: number; name: string }[]; initialPage: number;
}) {
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState('');
  const [box, setBox] = useState<Box | null>(null);          // hand-drawn box
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [sug, setSug] = useState(0);                           // active suggestion index
  const [kind, setKind] = useState<Kind>('fitment');
  const [part, setPart] = useState('');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [edit, setEdit] = useState<Capture | null>(null);
  const [showNums, setShowNums] = useState(true);
  const [showSugs, setShowSugs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [jump, setJump] = useState(String(initialPage));
  const [parts, setParts] = useState<string[]>([]);
  const imgWrap = useRef<HTMLDivElement>(null);
  const partInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (p: number) => {
    setError('');
    const r = await fetch(`/api/catalog/${catalog}/${p}`);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`); return; }
    setData(await r.json());
  }, [catalog]);
  const loadParts = useCallback(async () => setParts(await (await fetch('/api/catalog/parts')).json()), []);
  useEffect(() => { loadParts(); }, [loadParts]);

  useEffect(() => {
    setBox(null); setEdit(null); setSug(0); setJump(String(page));
    window.history.replaceState(null, '', `/catalog?p=${page}`);
    load(page);
  }, [page, load]);

  const sugs = useMemo(() => (showSugs ? data?.suggestions ?? [] : []), [data, showSugs]);
  const active = !box && !edit ? sugs[Math.min(sug, sugs.length - 1)] : undefined;

  // panel fields follow the active suggestion
  useEffect(() => {
    if (!active) return;
    setText(active.text); setPart(active.part); setNote('');
    partInput.current?.focus();
    partInput.current?.select();
  }, [active?.x0, active?.y0, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (p: number) => data && setPage(Math.min(Math.max(1, p), data.pages));

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
    setText(textIn(data.words, box)); setNote('');
    setTimeout(() => partInput.current?.focus(), 0);
  };

  // save the hand-drawn box or the active suggestion; status 'skipped' turns a suggestion down
  const post = async (b: Box, status: 'new' | 'skipped') => {
    if (!data) return;
    setBusy(true);
    const r = await fetch('/api/catalog/captures', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ catalog, page: data.page, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, text: text || active?.text || '-', kind, part, note, status }),
    });
    setBusy(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'save failed'); return; }
    setBox(null); setSug(0);
    if (status === 'new' && part.trim() && !parts.includes(part.trim())) loadParts();
    load(data.page);
  };
  const target = box ?? active ?? null;

  // Enter: save the open box / accept the suggestion. Esc: drop the drawn box, or skip the suggestion.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    const t = e.target as HTMLElement;
    const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
    if (edit) { if (e.key === 'Escape') setEdit(null); return; }   // EditPanel handles its own Enter
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && t.tagName !== 'SELECT' && t.tagName !== 'BUTTON' && t.className !== 'cat-jump') {
      if (target && !drag && !busy && text.trim()) { e.preventDefault(); post(target, 'new'); }
      return;
    }
    if (e.key === 'Escape') {
      if (box) { setBox(null); return; }
      if (active && !busy) { e.preventDefault(); post(active, 'skipped'); }
      return;
    }
    if (typing) return;
    if (e.key === 'ArrowRight') setPage((p) => (data ? Math.min(p + 1, data.pages) : p));
    if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const saveEdit = async (patch: Partial<Capture>) => {
    if (!edit) return;
    setBusy(true);
    const r = await fetch('/api/catalog/captures', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ capture_id: edit.capture_id, ...patch }),
    });
    setBusy(false);
    if (r.ok) { setEdit(await r.json()); load(page); if (patch.part) loadParts(); }
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
  const activeIdx = active ? sugs.indexOf(active) : -1;

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
        <label className="small"><input type="checkbox" checked={showSugs} onChange={(e) => setShowSugs(e.target.checked)} /> Suggestions</label>
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
          {sugs.map((s, i) => (
            <div
              key={`s${i}`}
              className={`cat-sug${i === activeIdx ? ' on' : ''}`}
              style={pct(s) ?? undefined}
              title={s.part || 'Suggestion'}
              onMouseDown={(e) => { e.stopPropagation(); setBox(null); setEdit(null); setSug(i); }}
            >
              <span>{i + 1}</span>
            </div>
          ))}
          {data?.captures.map((c) => (
            <div
              key={c.capture_id}
              className={`cat-cap${edit?.capture_id === c.capture_id ? ' on' : ''}`}
              style={{ ...pct(c), borderColor: KIND_COLOR[c.kind], background: `${KIND_COLOR[c.kind]}40` }}
              title={`${c.part || KIND_LABEL[c.kind]} #${c.capture_id}`}
              onMouseDown={(e) => { e.stopPropagation(); setBox(null); setEdit(c); }}
            />
          ))}
          {box ? <div className="cat-box" style={{ ...pct(box), borderColor: KIND_COLOR[kind] }} /> : null}
        </div>

        <aside className="cat-side">
          <div className="muted small">
            p{page} · {data?.section ?? ''} · {data?.captures.length ?? 0} saved · {sugs.length} suggested{data?.skipped ? ` · ${data.skipped} skipped` : ''}
          </div>
          <datalist id="cat-parts">{parts.map((p) => <option key={p} value={p} />)}</datalist>
          {edit ? (
            <EditPanel c={edit} busy={busy} onSave={saveEdit} onDelete={() => remove(edit.capture_id)} onClose={() => setEdit(null)} />
          ) : target && !drag ? (
            <>
              <h2>{box ? 'New capture' : `Suggestion ${activeIdx + 1} of ${sugs.length}`}</h2>
              <input ref={partInput} className="cat-note cat-part" list="cat-parts" value={part} onChange={(e) => setPart(e.target.value)}
                placeholder="Part (e.g. outer primary cover)" />
              <div className="cat-kinds">
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <button key={k} className={k === kind ? 'on' : ''} style={{ borderColor: KIND_COLOR[k] }} onClick={() => setKind(k)}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <textarea className="mono" rows={Math.min(18, Math.max(4, text.split('\n').length + 1))} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="No PDF text in this box (picture?). Type what it says." />
              <input className="cat-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
              <div className="cat-actions">
                <button className="primary" disabled={busy || !text.trim()} onClick={() => post(target, 'new')}>{box ? 'Save capture' : 'Accept'}</button>
                {box ? <button onClick={() => setBox(null)}>Cancel</button> : <button disabled={busy} onClick={() => active && post(active, 'skipped')}>Skip</button>}
              </div>
              <p className="muted small">{box ? 'Enter saves · Shift+Enter adds a line · Esc cancels' : 'Enter accepts · Esc skips · Shift+Enter adds a line · drag to draw your own'}</p>
            </>
          ) : data && showSugs ? (
            <p className="muted">Page done{data.captures.length ? '' : ' (nothing suggested)'}. Drag a box to add more, or → for the next page.</p>
          ) : (
            <p className="muted">Drag a box over a table, row or sentence to document it. Click a saved box to edit it.</p>
          )}

          {data?.captures.length ? (
            <>
              <h2>On this page</h2>
              {data.captures.map((c) => (
                <button key={c.capture_id} className="cat-item" onClick={() => { setBox(null); setEdit(c); }}>
                  <span className="cat-dot" style={{ background: KIND_COLOR[c.kind] }} />
                  <span className="small">{c.part || KIND_LABEL[c.kind]} · {c.status}{c.concept_slug ? ' · linked' : ''}</span>
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
  const [part, setPart] = useState(c.part);
  useEffect(() => { setText(c.text); setNote(c.note); setPart(c.part); }, [c]);
  // Enter in a field saves this capture (Shift+Enter = new line).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || (e.target as HTMLElement).tagName === 'BUTTON') return;
    e.preventDefault();
    e.stopPropagation();
    if (!busy) onSave({ text, note, part });
  };
  return (
    <div onKeyDown={onKeyDown} className="cat-edit">
      <h2>Capture #{c.capture_id}</h2>
      <input className="cat-note cat-part" list="cat-parts" value={part} onChange={(e) => setPart(e.target.value)} placeholder="Part" />
      {c.concept_slug ? <span className="muted small">Linked to part type: {c.concept_slug}</span> : null}
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
        <button className="primary" disabled={busy} onClick={() => onSave({ text, note, part })}>Save</button>
        <select value={c.status} onChange={(e) => onSave({ status: e.target.value })}>
          {['new', 'reviewed', 'loaded', 'rejected'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <button onClick={onDelete}>Delete</button>
        <button onClick={onClose}>Close</button>
      </div>
      <p className="muted small">Enter saves · Shift+Enter adds a line · Esc closes</p>
    </div>
  );
}
