import fs from 'node:fs';
import path from 'node:path';

// Read-only access to the repo's reports/ folder (written by the ETL and dev
// scripts). The console runs from apps/admin, so the repo root is two up.
export const REPORTS = path.resolve(process.cwd(), '../../reports');

// A path inside reports/, or null for anything that escapes it.
export function reportPath(rel: string): string | null {
  const p = path.resolve(REPORTS, rel.replace(/^reports\//, ''));
  return p.startsWith(REPORTS + path.sep) && fs.existsSync(p) && fs.statSync(p).isFile() ? p : null;
}

// Small CSV reader (quoted fields, "" escapes), header row -> objects.
export function readCsv(file: string): Record<string, string>[] {
  const text = fs.readFileSync(file, 'utf8');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
