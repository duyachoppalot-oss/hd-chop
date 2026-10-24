import Link from 'next/link';

// Long-distance year timeline. One column per year; each lane packs its bars
// into as many stacked tracks as overlaps need. Server-rendered, no JS.

export type Bar = {
  start: number;
  end: number;
  label?: string;
  title: string; // hover text
  href?: string;
  tone: string; // css class suffix: t-<tone>
};
export type Lane = { key: string; label: React.ReactNode; sub?: string; href?: string; bars: Bar[] };
export type Group = { key: string; title: React.ReactNode; lanes: Lane[] };

const YEAR = 22;
const TRACK = 19;

function pack(bars: Bar[]): Bar[][] {
  const tracks: { end: number; bars: Bar[] }[] = [];
  for (const b of [...bars].sort((a, c) => a.start - c.start || c.end - a.end)) {
    const t = tracks.find((t) => t.end < b.start);
    if (t) {
      t.bars.push(b);
      t.end = b.end;
    } else tracks.push({ end: b.end, bars: [b] });
  }
  return tracks.map((t) => t.bars);
}

export function Timeline({
  from,
  to,
  groups,
  corner,
  exists,
}: {
  from: number;
  to: number;
  groups: Group[];
  corner?: string;
  exists?: Set<number>; // years shaded in the header (e.g. the model was built)
}) {
  const years: number[] = [];
  for (let y = from; y <= to; y++) years.push(y);
  const width = years.length * YEAR;

  return (
    <div className="tl">
      <div className="tl-inner">
        <div className="tl-head">
          <div className="tl-corner">{corner}</div>
          <div className="tl-years">
            {years.map((y) => (
              <div key={y} className={`tl-year${y % 10 === 0 ? ' dec' : ''}${exists?.has(y) ? ' exists' : ''}`}>
                {y}
              </div>
            ))}
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.key}>
            <div className="tl-group">{g.title}</div>
            {g.lanes.map((lane) => {
              const tracks = pack(lane.bars);
              return (
                <div key={lane.key} className="tl-lane">
                  <div className="tl-label" title={typeof lane.label === 'string' ? lane.label : undefined}>
                    {lane.href ? <Link href={lane.href}>{lane.label}</Link> : lane.label}
                    {lane.sub ? <span className="sub">{lane.sub}</span> : null}
                  </div>
                  <div className="tl-track" style={{ width, height: Math.max(1, tracks.length) * TRACK + 4 }}>
                    {tracks.flatMap((bars, ti) =>
                      bars.map((b, bi) => {
                        const style = {
                          left: (b.start - from) * YEAR + 1,
                          width: (b.end - b.start + 1) * YEAR - 2,
                          top: 2 + ti * TRACK,
                        };
                        const text = (b.end - b.start + 1) * YEAR > 46 ? b.label : '';
                        const cls = `tl-bar t-${b.tone}`;
                        return b.href ? (
                          <Link key={`${ti}-${bi}`} href={b.href} className={cls} style={style} title={b.title}>
                            {text}
                          </Link>
                        ) : (
                          <span key={`${ti}-${bi}`} className={cls} style={style} title={b.title}>
                            {text}
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export const yearsText = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

// Stable color per chain within one page.
export function toneFor(key: string, seen: Map<string, string>): string {
  if (!seen.has(key)) seen.set(key, `c${seen.size % 8}`);
  return seen.get(key)!;
}
