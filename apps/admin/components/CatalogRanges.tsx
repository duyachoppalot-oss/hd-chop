'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Part page: the year ranges from Laken's catalog captures about this part, per family, on
// one year axis with the years our H-D fitment lists it. Gold = a capture that prints this
// part's number; light gold = a capture about the same kind of part. Lines = where the
// captured ranges change (green where our years start or stop that year too).
type Range = { from: number; to: number; up: boolean; line: string; page: number; capture_id: number; reason: 'number' | 'kind' };
type Fam = { family: string; ourRuns: [number, number][]; ranges: Range[]; capBreaks: number[] };
type Cap = { capture_id: number; page: number; part: string; note: string; kind: string; reason: 'number' | 'kind' };
const FAMILY: Record<string, string> = {
  touring: 'Touring', softail: 'Softail', dyna: 'Dyna', fxr: 'FXR', fl: 'FL big twin', fx: 'FX big twin',
  sportster: 'Sportster', trike: 'Trike', v_rod: 'V-Rod', street: 'Street', vintage: 'Vintage', revolution_max: 'RevMax',
};

export function CatalogRanges({ oem }: { oem: string }) {
  const [d, setD] = useState<{ families: Fam[]; captures: Cap[] } | null>(null);
  useEffect(() => { fetch(`/api/part/${encodeURIComponent(oem)}/captures`).then((r) => r.json()).then(setD); }, [oem]);
  if (!d) return null;
  if (!d.captures.length) return <p className="muted small">No catalog captures about this part yet.</p>;
  return (
    <div className="cr">
      {d.families.map((f) => <FamilyRow key={f.family} f={f} />)}
      <div className="cr-caps">
        {d.captures.map((c) => (
          <div key={c.capture_id} className="small">
            <span className={`cr-dot ${c.reason}`} />
            <Link href={`/catalog?p=${c.page}`}>p{c.page}</Link> <b>{c.part || '(no part name)'}</b>
            <span className="muted"> · {c.reason === 'number' ? 'prints this number' : 'same kind of part'}{c.kind !== 'fitment' ? ` · ${c.kind}` : ''}</span>
            {c.note ? <div className="muted" style={{ marginLeft: 16 }}>{c.note}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function FamilyRow({ f }: { f: Fam }) {
  const ys = [...f.ranges.flatMap((r) => [r.from, r.to]), ...f.ourRuns.flat()];
  const lo = Math.min(...ys) - 1, hi = Math.max(...ys) + 1, span = hi - lo + 1;
  const x = (y: number) => `${((y - lo) / span) * 100}%`;
  const w = (a: number, b: number) => `${((b - a + 1) / span) * 100}%`;
  const ticks = Array.from({ length: span }, (_, i) => lo + i).filter((y) => y % 5 === 0);
  const ourEdges = new Set(f.ourRuns.flatMap(([a, b]) => [a, b + 1]));
  // identical ranges merged, packed into lanes
  const merged = new Map<string, Range & { pages: Set<number>; lines: Set<string> }>();
  for (const r of f.ranges) {
    const k = `${r.from}-${r.to}-${r.reason}`;
    const m = merged.get(k) ?? merged.set(k, { ...r, pages: new Set(), lines: new Set() }).get(k)!;
    m.pages.add(r.page); m.lines.add(r.line);
  }
  const lanes: (Range & { pages: Set<number>; lines: Set<string> })[][] = [];
  for (const r of [...merged.values()].sort((a, z) => Number(z.reason === 'number') - Number(a.reason === 'number') || a.from - z.from)) {
    const lane = lanes.find((l) => l[l.length - 1].to < r.from && l[0].reason === r.reason);
    if (lane) lane.push(r); else lanes.push([r]);
  }
  return (
    <div className="cmp-tl" style={{ marginBottom: 10 }}>
      <div className="cr-fam">{FAMILY[f.family] ?? f.family}</div>
      <div className="cmp-axis">{ticks.map((y) => <span key={y} style={{ left: x(y) }}>{y}</span>)}</div>
      {f.capBreaks.map((y) => <div key={y} className={`cmp-mark ${ourEdges.has(y) ? 'agree' : 'ours'}`} style={{ left: x(y) }} title={`${y}${ourEdges.has(y) ? ': our years change here too' : ''}`} />)}
      <div className="cmp-label">Our H-D years for this part</div>
      <div className="cmp-row">
        {f.ourRuns.length ? f.ourRuns.map(([a, b]) => <span key={a} className="cmp-bar hd" style={{ left: x(a), width: w(a, b) }} title={`${a}-${b}`} />)
          : <span className="muted small" style={{ position: 'absolute', top: 4 }}>none on this family</span>}
      </div>
      <div className="cmp-label">Your catalog captures</div>
      {lanes.map((lane, i) => (
        <div key={i} className="cmp-row">
          {lane.map((r) => (
            <a key={`${r.from}-${r.to}`} className={`cmp-bar vt${r.reason === 'kind' ? ' kind' : ''}`} style={{ left: x(r.from), width: w(r.from, r.to) }}
              href={`/catalog?p=${[...r.pages][0]}`} title={`${r.from}-${r.up ? 'up' : r.to} · p${[...r.pages].join(', p')}\n${[...r.lines].join('\n')}`}>
              {r.from}-{r.up ? 'up' : String(r.to).slice(2)}
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}
