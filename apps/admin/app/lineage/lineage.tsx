'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import type { Handoff, LChain } from '@/lib/lineage';

// Part lineage. Type a part number: every part of the same kind on the same bikes, one row
// per part chain (numbers it was superseded by inside, oldest first), from the first design
// to the latest. "Next" = on some models this chain stops and the other starts that year.
// Timeline: year bars. Web: the same chains as a graph laid out by year; click a node for its
// numbers, double-click to make it the subject.
type Data = {
  subject: { oem: string; root: string; name: string | null }; match: string; families: string[];
  family: string | null; chains: LChain[]; handoffs: Handoff[]; error?: string;
};
const FAMILY: Record<string, string> = {
  touring: 'Touring', softail: 'Softail', dyna: 'Dyna', fxr: 'FXR', fl: 'FL big twin', fx: 'FX big twin',
  sportster: 'Sportster', trike: 'Trike', v_rod: 'V-Rod', street: 'Street', vintage: 'Vintage', revolution_max: 'RevMax',
};

export default function Lineage({ initialOem, initialFamily, initialView }: { initialOem: string; initialFamily: string; initialView: 'timeline' | 'web' }) {
  const [oem, setOem] = useState(initialOem);
  const [input, setInput] = useState(initialOem);
  const [family, setFamily] = useState(initialFamily);
  const [match, setMatch] = useState('');
  const [view, setView] = useState(initialView);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (o: string, f: string, m?: string) => {
    if (!o) return;
    setLoading(true);
    const q = new URLSearchParams({ oem: o, ...(f ? { family: f } : {}), ...(m ? { match: m } : {}) });
    const d: Data = await (await fetch(`/api/lineage?${q}`)).json();
    setData(d); setLoading(false);
    if (!d.error) { setMatch(d.match); if (d.family && d.family !== f) setFamily(d.family); }
  }, []);

  useEffect(() => { load(oem, family); }, [oem, family, load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!oem) return;
    window.history.replaceState(null, '', `/lineage?oem=${encodeURIComponent(oem)}${family ? `&family=${family}` : ''}${view === 'web' ? '&view=web' : ''}`);
  }, [oem, family, view]);

  const go = (o: string) => { setInput(o); setFamily(''); setOem(o); };
  const first = data?.chains[0];

  return (
    <div className="cmp">
      <div className="cat-bar">
        <h1>Lineage</h1>
        <span className="muted">Where a part came from and what replaced it</span>
        <form onSubmit={(e) => { e.preventDefault(); go(input.trim()); }} className="cmp-match">
          <input className="cat-note mono" style={{ width: 160 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Part number" />
          <button type="submit">Show</button>
        </form>
      </div>
      {!oem ? <p className="muted">Type a part number, e.g. 60665-89 (primary cover) or 75053-01B (fuel gauge).</p> : null}
      {loading && !data ? <p className="muted">Loading…</p> : null}
      {data?.error ? <p className="muted">{data.error}</p> : null}
      {data && !data.error ? (
        <>
          <div className="cmp-head">
            <h2 style={{ margin: 0 }}>
              <Link href={`/part/${data.subject.root}`} className="mono">{data.subject.oem}</Link>{' '}
              <span className="muted" style={{ textTransform: 'none' }}>{data.subject.name}</span>
            </h2>
            {first ? (
              <p className="small" style={{ margin: 0 }}>
                Started with <Link href={`/part/${first.root}`} className="mono">{first.members[0]}</Link> in {first.from}
                {' · '}{data.chains.length} design{data.chains.length === 1 ? '' : 's'} on {FAMILY[data.family ?? ''] ?? data.family} bikes
                {' · '}{data.handoffs.length} hand-off{data.handoffs.length === 1 ? '' : 's'}
              </p>
            ) : null}
            <div className="cmp-tabs">
              {data.families.map((f) => (
                <button key={f} className={f === data.family ? 'on' : ''} onClick={() => setFamily(f)}>{FAMILY[f] ?? f}</button>
              ))}
              <span style={{ width: 16 }} />
              <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')}>Timeline</button>
              <button className={view === 'web' ? 'on' : ''} onClick={() => setView('web')}>Web</button>
            </div>
            <form className="cmp-match" onSubmit={(e) => { e.preventDefault(); load(oem, family, match); }}>
              <label className="small muted">Same kind = parts named like</label>
              <input className="cat-note" value={match} onChange={(e) => setMatch(e.target.value)} />
              <button type="submit">Find</button>
            </form>
          </div>
          {!data.chains.length ? <p className="muted">No fitment on file for this part.</p>
            : view === 'timeline' ? <TimelineView d={data} go={go} /> : <WebView d={data} go={go} />}
        </>
      ) : null}
    </div>
  );
}

function TimelineView({ d, go }: { d: Data; go: (o: string) => void }) {
  const lo = Math.min(...d.chains.map((c) => c.from)) - 1;
  const hi = Math.max(...d.chains.map((c) => c.to)) + 1;
  const span = hi - lo + 1;
  const pct = (y: number) => ((y - lo) / span) * 100;
  const ticks = Array.from({ length: span }, (_, i) => lo + i).filter((y) => y % 5 === 0);
  const out = new Map<string, Handoff[]>();
  for (const h of d.handoffs) (out.get(h.from) ?? out.set(h.from, []).get(h.from)!).push(h);
  return (
    <div className="cmp-tl">
      <div className="cmp-axis">{ticks.map((y) => <span key={y} style={{ left: `${pct(y)}%` }}>{y}</span>)}</div>
      {[...new Set(d.handoffs.map((h) => h.year))].map((y) => <div key={y} className="cmp-mark ours" style={{ left: `${pct(y)}%` }} />)}
      {d.chains.map((c, i) => {
        const late = (c.from - lo) / span > 0.55;
        return (
          <div key={c.root} className={`cmp-row lin-row${c.isSubject ? ' subject' : ''}`}>
            {c.runs.map(([a, b]) => (
              <span key={a} className={`cmp-bar ${c.isSubject ? 'vt' : 'hd'}`} style={{ left: `${pct(a)}%`, width: `${((b - a + 1) / span) * 100}%` }}
                title={`${a}-${b} · ${c.models.join(' ')}`} />
            ))}
            <span className={`cmp-chain${late ? ' end' : ''}`} style={late ? { right: `${100 - pct(c.from)}%` } : { left: `${pct(c.from)}%` }}>
              {i === 0 ? <span className="lin-tag">first</span> : null}
              {c.members.map((m, j) => (
                <span key={m}>{j ? <span className="muted"> → </span> : null}<Link href={`/part/${m.replace(/-/g, '')}`} className="mono">{m}</Link></span>
              ))}
              <span className="muted small"> {c.name} · {c.from === c.to ? c.from : `${c.from}-${c.to}`}</span>
              {(out.get(c.root) ?? []).slice(0, 3).map((h) => (
                <button key={`${h.to}${h.year}`} className="lin-next" onClick={() => go(h.to)} title={`${h.year}: ${h.models.join(' ')}`}>
                  next {h.year} → {h.to}
                </button>
              ))}
            </span>
          </div>
        );
      })}
      <p className="muted small" style={{ marginTop: 10 }}>
        Each row is one design (a part chain; arrows inside = superseded by). Gold = the part you looked up. Bars = years it fits these bikes; hover for models.
        &quot;next&quot; = on some models this design stops and that one starts that year (click to follow it). Grey lines = hand-off years.
      </p>
    </div>
  );
}

function WebView({ d, go }: { d: Data; go: (o: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const router = useRouter();
  const [picked, setPicked] = useState<LChain | null>(null);
  const lo = Math.min(...d.chains.map((c) => c.from));

  useEffect(() => {
    if (!box.current) return;
    const els: ElementDefinition[] = [
      ...d.chains.map((c) => ({
        data: { id: c.root, label: `${c.root}${c.members.length > 1 ? ` (+${c.members.length - 1})` : ''}\n${c.from === c.to ? c.from : `${c.from}-${String(c.to).slice(2)}`}`, subject: c.isSubject ? 1 : 0 },
        // staircase: one row per design (oldest at the top), x = its first year
        position: { x: (c.from - lo) * 44, y: d.chains.indexOf(c) * 56 },
      })),
      ...d.handoffs.map((h, i) => ({ data: { id: `h${i}`, source: h.from, target: h.to, label: `${h.year}${h.models.length > 1 ? ` ×${h.models.length}` : ''}` } })),
    ];
    const g = cytoscape({
      container: box.current, elements: els, layout: { name: 'preset', fit: true, padding: 50 }, wheelSensitivity: 0.3, maxZoom: 2.5,
      style: [
        { selector: 'node', style: { shape: 'round-rectangle', width: 130, height: 38, 'background-color': '#2c3b2a', 'border-width': 1, 'border-color': '#6fae6a',
          label: 'data(label)', color: '#f2e8d0', 'font-size': 12, 'font-family': 'ui-monospace, Menlo, monospace', 'text-wrap': 'wrap', 'text-max-width': '124px', 'text-valign': 'center', 'text-halign': 'center' } },
        { selector: 'node[subject = 1]', style: { 'background-color': '#d4a52c', color: '#000', 'border-color': '#f2e8d0', 'border-width': 2 } },
        { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#f2e8d0' } },
        { selector: 'edge', style: { width: 1.5, 'line-color': '#6b8f67', 'line-style': 'dashed', 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#6b8f67',
          label: 'data(label)', 'font-size': 9, color: '#a39a86', 'text-outline-color': '#15130f', 'text-outline-width': 2 } },
      ],
    });
    g.on('tap', 'node', (e) => setPicked(d.chains.find((c) => c.root === e.target.id()) ?? null));
    g.on('dbltap', 'node', (e) => go(e.target.id()));
    cy.current = g;
    return () => g.destroy();
  }, [d, lo, go, router]);

  return (
    <div className="lin-web-wrap">
      <div ref={box} className="lin-web" />
      <aside className="lin-pick">
        {picked ? (
          <>
            <h3>{picked.name}</h3>
            <p className="small">{picked.from === picked.to ? picked.from : `${picked.from}-${picked.to}`} · {picked.models.length} models</p>
            <p className="small">Numbers, oldest first:</p>
            {picked.members.map((m) => <div key={m}><Link href={`/part/${m.replace(/-/g, '')}`} className="mono">{m}</Link></div>)}
            <p className="small muted">{picked.models.join(' ')}</p>
            <button className="lin-next" onClick={() => go(picked.root)}>Make this the subject</button>
          </>
        ) : <p className="muted small">Click a design for its numbers and models; double-click to center the lineage on it. Scroll to zoom, drag to pan.
          Top to bottom = oldest to newest design, left to right = first year; arrows = hand-offs (year, ×models).</p>}
      </aside>
    </div>
  );
}
