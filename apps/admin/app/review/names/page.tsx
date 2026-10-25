import Link from 'next/link';
import path from 'node:path';
import { reviewName } from '@/app/actions';
import { query } from '@/lib/db';
import { readCsv, REPORTS, reportPath } from '@/lib/reports';

export const dynamic = 'force-dynamic';
const PAGE = 40;

// The garbled part names from scripts/dev/name_review.mjs (reports/name_review.csv),
// most-fitted first. Type the right name and Rename, or "Name is fine" to drop it
// from the list. Each part number opens its part page (fitment, notes, overrides).
export default async function NameReview({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const file = reportPath('name_review.csv');
  if (!file) {
    return (
      <>
        <h1>Name review</h1>
        <p className="muted">No reports/name_review.csv yet. Run <code>node scripts/dev/name_review.mjs</code> and copy the newest file to reports/name_review.csv.</p>
      </>
    );
  }
  const rows = readCsv(file);
  const parts = await query<{ oem_display: string; oem_number: string; name: string; done: boolean }>(
    `SELECT p.oem_display, p.oem_number, p.description_clean AS name,
            EXISTS (SELECT 1 FROM admin_overrides o WHERE o.kind = 'rename_part' AND o.oem_number = p.oem_number AND o.active AND o.reason LIKE 'name_review%') AS done
     FROM oem_parts p WHERE p.oem_display = ANY($1)`,
    [rows.map((r) => r.oem)]
  );
  const live = new Map(parts.map((p) => [p.oem_display, p]));
  const open = rows.filter((r) => live.has(r.oem) && !live.get(r.oem)!.done);
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const pages = Math.max(1, Math.ceil(open.length / PAGE));
  const shown = open.slice((page - 1) * PAGE, page * PAGE);
  const back = `/review/names?page=${page}`;

  return (
    <>
      <h1>Name review</h1>
      <p className="muted">
        {open.length} of {rows.length} names left, most-fitted parts first. Type the right name and press Rename, or Name is fine
        to drop it from the list. The vendor name is a lead for the same OEM number, not proof. Source: <code>{path.relative(path.dirname(REPORTS), file)}</code>
      </p>
      <div className="row" style={{ margin: '10px 0' }}>
        {page > 1 ? <Link href={`/review/names?page=${page - 1}`}>← Previous</Link> : null}
        <span className="muted small">Page {page} of {pages}</span>
        {page < pages ? <Link href={`/review/names?page=${page + 1}`}>Next →</Link> : null}
      </div>
      <div className="panel">
        {shown.map((r) => {
          const p = live.get(r.oem)!;
          return (
            <div key={r.oem} className="review-row">
              <div className="row">
                <Link href={`/part/${p.oem_number}`} className="mono">{r.oem}</Link>
                <span className="muted small">{r.bikes} bikes · {r.years} · {r.models}</span>
                {r.concept ? <span className="chip">{r.concept}</span> : null}
              </div>
              <div className="row small">
                <span className="muted">Now:</span> <b>{p.name}</b>
                <span className="muted">({r.why.replace(/^(unknown:\s*)(.*)$/, (_, h, w) => h + [...new Set(w.split(' '))].join(' '))})</span>
              </div>
              {r.vendor_hint ? <div className="small muted">Vendor: {r.vendor_hint}</div> : null}
              <form action={reviewName} className="row">
                <input type="hidden" name="oem" value={p.oem_number} />
                <input type="hidden" name="current" value={p.name} />
                <input type="hidden" name="back" value={back} />
                <input name="value" defaultValue={p.name} style={{ flex: 1, minWidth: 260 }} aria-label={`New name for ${r.oem}`} />
                <button type="submit">Rename</button>
                <button type="submit" name="keep" value="1" className="ghost">Name is fine</button>
              </form>
            </div>
          );
        })}
        {!shown.length ? <p className="muted">All done.</p> : null}
      </div>
    </>
  );
}
