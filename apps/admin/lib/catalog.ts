import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Word } from './catalogText';

export type { Word } from './catalogText';

// Catalog PDFs the viewer (/catalog) can show. Words come from the pdfplumber cache
// (scripts/catalog/pdf_words.py: [text, x0, x1, top, bottom, size, bold] in points);
// page images are rendered on first view with pdftoppm and cached next to them.
const run = promisify(execFile);
const CACHE = path.join(process.env.HDCHOP_CATALOG_CACHE ?? os.tmpdir(), 'hdchop_vtwin');

export const CATALOGS = {
  vtwin: {
    title: 'V-Twin Mfg catalog',
    pdf: path.join(os.homedir(), 'Desktop/Stanky/CATALOGS/VTCatalog.pdf'),
    pages: 1368,
    sections: [
      { from: 1, name: 'Touring' },
      { from: 159, name: 'Big Twin 1984-up' },
      { from: 483, name: 'Classic 1915-83' },
      { from: 843, name: 'Sportster' },
      { from: 1029, name: 'Multi-fit / Chopper' },
      { from: 1275, name: 'Tools' },
    ],
  },
} as const;
export type CatalogKey = keyof typeof CATALOGS;
export const isCatalog = (k: string): k is CatalogKey => k in CATALOGS;

export const sectionOf = (c: CatalogKey, page: number) =>
  [...CATALOGS[c].sections].reverse().find((s) => page >= s.from)?.name ?? '';


// Stacked fractions ("3/4" set half a line off, between a number and its inch mark)
// are joined back: 7 + 3/4 + ” -> 7-3/4 ”.
const FR = /^\d{1,2}[/•]\d{1,2}$/;
export function pageWords(c: CatalogKey, page: number): Word[] {
  const f = path.join(CACHE, 'words', `${String(page).padStart(4, '0')}.json`);
  if (c !== 'vtwin' || !fs.existsSync(f)) return [];
  const raw = (JSON.parse(fs.readFileSync(f, 'utf8')) as (string | number)[][]).map(
    (w) => [String(w[0]), Number(w[1]), Number(w[2]), Number(w[3]), Number(w[4]), Number(w[5] ?? 0), Number(w[6] ?? 0)] as Word
  );
  const fr = raw.filter((w) => FR.test(w[0]));
  const rest = raw.filter((w) => !FR.test(w[0]));
  for (const f of fr) {
    const a = rest
      .filter((a) => Math.abs(a[3] - f[3]) > 0.5 && Math.abs(a[3] - f[3]) <= 7 && /\d$/.test(a[0]) && f[1] - a[2] >= -1.5 && f[1] - a[2] <= 4)
      .filter((a) => rest.some((b) => Math.abs(b[3] - a[3]) < 2.5 && /^(["”]|’’)/.test(b[0]) && b[1] - f[2] >= -1.5 && b[1] - f[2] <= 4))
      .sort((p, q) => Math.abs(p[3] - f[3]) - Math.abs(q[3] - f[3]))[0];
    if (a) a[0] = `${a[0]}-${f[0].replace('•', '/')}`;
    else rest.push(f);
  }
  return rest;
}

const sizes = new Map<string, { width: number; height: number }>();
export async function pageSize(c: CatalogKey, page: number) {
  const k = `${c}:${page}`;
  if (!sizes.has(k)) {
    const { stdout } = await run('pdfinfo', ['-f', String(page), '-l', String(page), CATALOGS[c].pdf]);
    const m = stdout.match(/Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)/);
    sizes.set(k, m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 612, height: 783 });
  }
  return sizes.get(k)!;
}

// PNG of one page at 120 dpi, rendered once.
export async function pageImage(c: CatalogKey, page: number): Promise<Buffer> {
  const dir = path.join(CACHE, 'png');
  const base = path.join(dir, String(page).padStart(4, '0'));
  if (!fs.existsSync(`${base}.png`)) {
    fs.mkdirSync(dir, { recursive: true });
    await run('pdftoppm', ['-f', String(page), '-l', String(page), '-r', '120', '-png', '-singlefile', CATALOGS[c].pdf, base]);
  }
  return fs.readFileSync(`${base}.png`);
}

export const KINDS = ['fitment', 'size', 'stock_spec', 'supersession', 'other'] as const;
export type Kind = (typeof KINDS)[number];
export const STATUSES = ['new', 'reviewed', 'loaded', 'rejected', 'skipped'] as const;
export type Capture = {
  capture_id: number; page: number; x0: number; y0: number; x1: number; y1: number;
  text: string; kind: Kind; part: string; concept_slug: string | null; note: string; status: string; created_at: string;
};
export const CAPTURE_COLS = 'capture_id, page, x0::float, y0::float, x1::float, y1::float, text, kind, part, concept_slug, note, status, created_at';
// part name -> part type slug when it matches a part_concepts name or term (case-insensitive)
export const CONCEPT_OF = `(SELECT slug FROM part_concepts p WHERE lower(p.display_name) = lower(trim($PART))
   OR lower(trim($PART)) = ANY (SELECT lower(t) FROM unnest(p.hd_terms || p.user_terms) t) ORDER BY concept_id LIMIT 1)`;
