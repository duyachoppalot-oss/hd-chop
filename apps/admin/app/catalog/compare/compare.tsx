'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

// Left: every part name from the catalog captures. Right: for one part + family, the
// years where your captured ranges change next to the years where our H-D fitment
// changes, then the lineage of our matching parts on the same year axis (one row per
// part chain, superseded numbers inside it, oldest first).
type ListItem = { part: string; captures: number; families: { family: string; ranges: number; pages: number[] }[] };
type Range = { from: number; to: number; up: boolean; models: string[]; line: string; capture_id: number; page: number; via: string };
type Chain = { oem: string; root: string; name: string; from: number; to: number; runs: [number, number][]; members: string[]; steps: [string, string][] };
type Detail = {
  part: string; family: string; match: string; from: number; to: number; ranges: Range[];
  vtBreaks: number[]; ourBreaks: number[]; ourYears: number[]; agree: number[]; close: number[]; vtOnly: number[]; ourOnly: number[];
  parts: Chain[]; error?: string;
};

const FAMILY: Record<string, string> = {
  touring: 'Touring', softail: 'Softail', dyna: 'Dyna', fxr: 'FXR', fl: 'FL big twin', fx: 'FX big twin',
  sportster: 'Sportster', trike: 'Trike', v_rod: 'V-Rod', street: 'Street', vintage: 'Vintage', revolution_max: 'RevMax',
};

export default function Compare({ initialPart, initialFamily }: { initialPart: string; initialFamily: string }) {
  const [list, setList] = useState<ListItem[]>([]);
  const [filter, setFilter] = useState('');
  const [part, setPart] = useState(initialPart);
  const [family, setFamily] = useState(initialFamily);
  const [match, setMatch] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetch('/api/catalog/compare').then((r) => r.json()).then((d) => setList(d.parts)); }, []);

  const load = useCallback(async (p: string, f: string, m?: string) => {
    if (!p || !f) return;
    setLoading(true);
    const q = new URLSearchParams({ part: p, family: f, ...(m ? { match: m } : {}) });
    const d = await (await fetch(`/api/catalog/compare?${q}`)).json();
    setDetail(d); setMatch(d.match ?? m ?? p); setLoading(false);
    window.history.replaceState(null, '', `/catalog/compare?part=${encodeURIComponent(p)}&family=${f}`);
  }, []);

  // pick the first family when a part is chosen without one
  useEffect(() => {
    if (!part || !list.length) return;
    const item = list.find((l) => l.part === part);
    const f = family && item?.families.some((x) => x.family === family) ? family : item?.families[0]?.family ?? '';
    if (f !== family) setFamily(f);
    else load(part, f);
  }, [part, family, list, load]);

  const shown = useMemo(() => list.filter((l) => !filter || l.part.includes(filter.toLowerCase())), [list, filter]);
  const item = list.find((l) => l.part === part);

  return (
    <div className="cmp">
      <div className="cat-bar">
        <h1>Compare</h1>
        <span className="muted">Your catalog captures vs our H-D fitment</span>
        <Link href="/catalog" className="small">← Catalog viewer</Link>
      </div>
      <div className="cmp-main">
        <aside className="cmp-list">
          <input className="cat-note" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${list.length} part names…`} />
          {shown.map((l) => (
            <button key={l.part} className={`cmp-item${l.part === part ? ' on' : ''}`} onClick={() => { setPart(l.part); setFamily(''); }}>
              <span>{l.part}</span>
              <span className="muted small">{l.captures} box{l.captures > 1 ? 'es' : ''} · {l.families.map((f) => FAMILY[f.family] ?? f.family).join(', ')}</span>
            </button>
          ))}
        </aside>

        <section className="cmp-detail">
          {!part ? <p className="muted">Pick a part name on the left.</p> : null}
          {item ? (
            <div className="cmp-head">
              <h2 style={{ margin: 0 }}>{part}</h2>
              <div className="cmp-tabs">
                {item.families.map((f) => (
                  <button key={f.family} className={f.family === family ? 'on' : ''} onClick={() => setFamily(f.family)}>
                    {FAMILY[f.family] ?? f.family} <span className="muted small">{f.ranges}</span>
                  </button>
                ))}
              </div>
              <form className="cmp-match" onSubmit={(e) => { e.preventDefault(); load(part, family, match); }}>
                <label className="small muted">Our parts named like</label>
                <input className="cat-note" value={match} onChange={(e) => setMatch(e.target.value)} />
                <button type="submit">Find</button>
              </form>
            </div>
          ) : null}
          {loading ? <p className="muted">Loading…</p> : detail?.error ? <p className="muted">{detail.error}</p> : detail && detail.part === part ? <DetailView d={detail} /> : null}
        </section>
      </div>
    </div>
  );
}

function DetailView({ d }: { d: Detail }) {
  const lo = Math.min(d.from, ...d.parts.map((p) => p.from)) - 1;
  const hi = Math.max(d.to, ...d.parts.map((p) => p.to)) + 1;
  const span = hi - lo + 1;
  const x = (y: number) => `${((y - lo) / span) * 100}%`;
  const w = (a: number, b: number) => `${((b - a + 1) / span) * 100}%`;
  const ticks = Array.from({ length: span }, (_, i) => lo + i).filter((y) => y % 5 === 0);

  // your ranges, identical ones merged, packed into lanes so bars don't overlap
  const merged = new Map<string, Range & { pages: Set<number>; lines: Set<string> }>();
  for (const r of d.ranges) {
    const k = `${r.from}-${r.to}`;
    const m = merged.get(k) ?? merged.set(k, { ...r, pages: new Set(), lines: new Set() }).get(k)!;
    m.pages.add(r.page); m.lines.add(r.line);
  }
  const lanes: (typeof merged extends Map<string, infer V> ? V : never)[][] = [];
  for (const r of [...merged.values()].sort((a, z) => a.from - z.from || z.to - a.to)) {
    const lane = lanes.find((l) => l[l.length - 1].to < r.from);
    if (lane) lane.push(r); else lanes.push([r]);
  }
  const mark = (y: number) => (d.agree.includes(y) ? 'agree' : d.close.includes(y) ? 'close' : d.vtOnly.includes(y) ? 'vt' : 'ours');

  return (
    <>
      <div className="cmp-sum">
        <span className="cmp-chip agree">Agree {d.agree.join(', ') || '—'}</span>
        <span className="cmp-chip close">Within a year {d.close.join(', ') || '—'}</span>
        <span className="cmp-chip vt" title="Your captures change here, our H-D fitment doesn't: a possible gap">Only in your captures {d.vtOnly.join(', ') || '—'}</span>
        <span className="cmp-chip ours">Only in our H-D data {d.ourOnly.join(', ') || '—'}</span>
      </div>

      <div className="cmp-tl">
        <div className="cmp-axis">
          {ticks.map((y) => <span key={y} style={{ left: x(y) }}>{y}</span>)}
        </div>
        {[...new Set([...d.vtBreaks, ...d.ourBreaks])].map((y) => (
          <div key={`m${y}`} className={`cmp-mark ${mark(y)}`} style={{ left: x(y) }} title={`${y}: ${mark(y)}`} />
        ))}

        <div className="cmp-label">Your captures (V-Twin catalog)</div>
        {lanes.map((lane, i) => (
          <div key={`l${i}`} className="cmp-row">
            {lane.map((r) => (
              <a key={`${r.from}-${r.to}`} className="cmp-bar vt" style={{ left: x(r.from), width: w(r.from, r.to) }}
                href={`/catalog?p=${[...r.pages][0]}`} title={`${r.from}-${r.up ? 'up' : r.to} · p${[...r.pages].join(', p')}\n${[...r.lines].join('\n')}`}>
                {r.from}-{r.up ? 'up' : String(r.to).slice(2)}
              </a>
            ))}
          </div>
        ))}

        <div className="cmp-label">Our H-D parts, oldest first ({d.parts.length} chain{d.parts.length === 1 ? '' : 's'}){d.parts.length ? '' : ': none found, try other words above'}</div>
        {d.parts.map((p) => (
          <div key={p.root} className="cmp-row">
            {p.runs.map(([a, b]) => (
              <span key={a} className="cmp-bar hd" style={{ left: x(a), width: w(a, b) }} title={`${a}-${b}`} />
            ))}
            <span className={`cmp-chain${(p.from - lo) / span > 0.55 ? ' end' : ''}`}
              style={(p.from - lo) / span > 0.55 ? { right: `${100 - ((p.from - lo) / span) * 100}%` } : { left: x(p.from) }}>
              {p.members.map((m, i) => (
                <span key={m}>
                  {i ? <span className="muted"> → </span> : null}
                  <Link href={`/part/${encodeURIComponent(m)}`} className="mono">{m}</Link>
                </span>
              ))}
              <span className="muted small"> {p.name} · {p.from === p.to ? p.from : `${p.from}-${p.to}`}</span>
              <Link href={`/web?seed=${encodeURIComponent(`part:${p.root.replace(/-/g, '')}`)}`} className="small"> web</Link>
              <Link href={`/lineage?oem=${encodeURIComponent(p.root)}&family=${d.family}`} className="small"> lineage</Link>
            </span>
          </div>
        ))}
      </div>
      <p className="muted small">
        Bars: gold = your captured ranges (click to open the page), green = years our H-D fitment lists that part on this family.
        Lines: where something changes — green both agree, yellow within a year, red only in your captures (possible gap in our data), grey only in ours.
        Arrows inside a row = the number was superseded by the next.
      </p>
    </>
  );
}
