// scripts/etl/lib/servicecatalog.mjs
//
// Reads the HD parts catalogs scraped from the H-D service portal into
// catalog-extract/rows/*.tsv (DATA_RIGHTS.md). Shared by 09_service_catalog
// (fitment) and 01_vehicles (evidence that a model existed in a year).
//
// TSV lines (tab-separated):
//   7 columns  page | section | figure | index | part number | description | models   <- fitment
//   5 columns  page | section | figure | part number | figure name                   <- numeric part
//              index at the back of the book, filed under the last section; no models -> skipped
//   6 columns  sidecar cross-references ("... - FLTRI: FLTRI")                      -> skipped
//   fewer      notes, headers                                                       -> skipped
// Years per book from catalog-extract/manifest.json (slug -> from/to).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CATALOG_EXTRACT_DIR = process.env.CATALOG_EXTRACT_DIR || path.join(os.homedir(), 'Developer', 'catalog-extract');

export const available = (dir = CATALOG_EXTRACT_DIR) => fs.existsSync(path.join(dir, 'manifest.json'));

// -> { rows: [{ id, part_number, description, used_on_raw, section, year_start, year_end, doc }],
//      lineKinds, books: [{ slug, from, to, family }], noManifest: [slug] }
export function readBooks(dir = CATALOG_EXTRACT_DIR) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const bySlug = new Map(Object.values(manifest).map((m) => [m.slug, m]));
  const rows = [];
  const lineKinds = { fitment: 0, part_index: 0, cross_ref: 0, other: 0 };
  const books = [];
  const noManifest = [];
  for (const f of fs.readdirSync(path.join(dir, 'rows')).filter((f) => f.endsWith('.tsv')).sort()) {
    const slug = f.slice(0, -4);
    const m = bySlug.get(slug);
    if (!m) { noManifest.push(slug); continue; }
    books.push({ slug, from: m.from, to: m.to, family: m.family });
    fs.readFileSync(path.join(dir, 'rows', f), 'utf8').split('\n').forEach((line, i) => {
      const c = line.split('\t');
      if (c.length === 7) {
        lineKinds.fitment++;
        rows.push({
          id: `${slug}:${i + 1}`,
          part_number: c[4],
          description: c[5],
          used_on_raw: c[6],
          section: c[1],
          year_start: m.from,
          year_end: m.to,
          doc: slug,
        });
      } else if (c.length === 5) lineKinds.part_index++;
      else if (c.length === 6) lineKinds.cross_ref++;
      else lineKinds.other++;
    });
  }
  return { rows, lineKinds, books, noManifest };
}
