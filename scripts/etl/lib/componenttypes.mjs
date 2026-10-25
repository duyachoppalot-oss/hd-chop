// scripts/etl/lib/componenttypes.mjs
//
// Reads the "Component Types and Introduction Dates" section of the H-D
// service-portal parts catalogs saved in catalog-extract/html/*.html (the
// rows/*.tsv extract leaves it out). As text the section is:
//   Component Types and Introduction Dates
//   View interactive table
//   101A1 - Generic Nuts          <- type heading: code - name
//   7321                          <- part number
//   Unknown                       <- introduction year, or "Unknown"
//   ...
// and ends at the first line that is neither a heading, a part number nor a year.
// Names are cut at 20 characters in some books ("Wire Harness sub-com"); the
// longest name seen for a code wins. A few lines pair a code with another code's
// name where tables meet; the name seen most often for a code wins.

import fs from 'node:fs';
import path from 'node:path';
import { CATALOG_EXTRACT_DIR } from './servicecatalog.mjs';
import { normalize } from './parts.mjs';

const TITLE = 'Component Types and Introduction Dates';
const HEAD = /^(\d{3}[A-Z]\d{1,2}) - (.+)$/;
const PART = /^[0-9A-Z][0-9A-Z.-]{2,}$/;
const YEAR = /^(\d{4}|Unknown)$/;

const textLines = (html) =>
  html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

// -> { books, rows: [{ book, code, name, display, year }] }
export function readComponentRows(dir = CATALOG_EXTRACT_DIR) {
  const htmlDir = path.join(dir, 'html');
  const rows = [];
  let books = 0;
  for (const f of fs.readdirSync(htmlDir).filter((f) => f.endsWith('.html')).sort()) {
    const lines = textLines(fs.readFileSync(path.join(htmlDir, f), 'utf8'));
    const start = lines.indexOf(TITLE);
    if (start === -1) continue;
    books++;
    const book = f.replace(/\.html$/, '');
    let code = null, name = null;
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      const h = HEAD.exec(l);
      if (h) { code = h[1]; name = h[2].trim(); continue; }
      if (l === 'View interactive table') continue;
      if (code && PART.test(l) && YEAR.test(lines[i + 1] ?? '')) {
        const y = lines[i + 1];
        rows.push({ book, code, name, display: l, year: y === 'Unknown' ? null : Number(y) });
        i++;
        continue;
      }
      if (code) break;
    }
  }
  return { books, rows };
}

// Rows -> one entry per normalized part number:
// { oem_number, type_code, type_name, intro_year, books, other_types }.
// type_code = the code most books give; intro_year = earliest year any book gives.
export function summarize(rows) {
  const names = new Map(); // code -> Map(name -> count)
  for (const r of rows) {
    const m = names.get(r.code) ?? names.set(r.code, new Map()).get(r.code);
    m.set(r.name, (m.get(r.name) ?? 0) + 1);
  }
  const nameOf = new Map(
    [...names].map(([code, m]) => {
      const top = Math.max(...m.values());
      // Most common name; among names that are a truncation of it, keep the longest.
      const best = [...m].filter(([, n]) => n === top).map(([s]) => s).sort((a, b) => b.length - a.length)[0];
      const longer = [...m.keys()].filter((s) => s.startsWith(best) && s.length > best.length).sort((a, b) => b.length - a.length)[0];
      return [code, longer ?? best];
    })
  );
  const parts = new Map();
  for (const r of rows) {
    const n = normalize(r.display);
    const p = parts.get(n) ?? parts.set(n, { codes: new Map(), years: [], books: new Set() }).get(n);
    p.codes.set(r.code, (p.codes.get(r.code) ?? 0) + 1);
    if (r.year != null) p.years.push(r.year);
    p.books.add(r.book);
  }
  return [...parts].map(([oem_number, p]) => {
    const ranked = [...p.codes].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    return {
      oem_number,
      type_code: ranked[0],
      type_name: nameOf.get(ranked[0]),
      intro_year: p.years.length ? Math.min(...p.years) : null,
      books: p.books.size,
      other_types: ranked.slice(1),
    };
  });
}
