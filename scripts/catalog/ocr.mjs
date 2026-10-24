// OCR every page of the listed books into the page cache (books.mjs OCR_DIR).
// Reads PDFs, writes text files outside the repo; touches no database.
//   node scripts/catalog/ocr.mjs                    (all books in books.mjs)
//   node scripts/catalog/ocr.mjs 1942-wla 1950-45ci (just these)
//   add --force to redo pages already cached
// Each page: pdftoppm (300 dpi, gray) | tesseract --psm 6 -> pNNN.txt + pNNN.tsv (word boxes,
// for column layouts like the WLA quantity columns). Pages run in parallel.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BOOKS, bookBySlug, pdfPath, ocrDir } from './books.mjs';

const FORCE = process.argv.includes('--force');
const slugs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const books = slugs.length ? slugs.map((s) => bookBySlug(s) ?? (() => { throw new Error(`unknown book ${s}`); })()) : BOOKS;
const JOBS = Math.max(1, os.cpus().length - 1);

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, opts);
    let out = '', err = '';
    p.stdout?.on('data', (d) => (out += d));
    p.stderr?.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${code}: ${err.slice(0, 200)}`))));
  });

async function pageCount(file) {
  const info = await run('pdfinfo', [file]);
  return Number(/Pages:\s+(\d+)/.exec(info)[1]);
}

async function ocrPage(file, page, outTxt) {
  const tmp = path.join(os.tmpdir(), `hdchop-ocr-${process.pid}-${page}`);
  await run('pdftoppm', ['-f', String(page), '-l', String(page), '-r', '300', '-gray', '-png', '-singlefile', file, tmp]);
  try {
    await run('tesseract', [`${tmp}.png`, outTxt.replace(/\.txt$/, ''), '--psm', '6', 'txt', 'tsv'], { env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
  } finally {
    fs.rmSync(`${tmp}.png`, { force: true });
  }
}

for (const b of books) {
  const file = pdfPath(b);
  const dir = ocrDir(b);
  fs.mkdirSync(dir, { recursive: true });
  const n = await pageCount(file);
  const todo = [];
  for (let p = 1; p <= n; p++) {
    const out = path.join(dir, `p${String(p).padStart(3, '0')}.txt`);
    if (FORCE || !fs.existsSync(out)) todo.push({ p, out });
  }
  const t0 = Date.now();
  let done = 0, failed = 0;
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: JOBS }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try { await ocrPage(file, job.p, job.out); } catch (e) { failed++; console.error(`${b.slug} p${job.p}: ${e.message}`); }
        if (++done % 25 === 0) console.log(`${b.slug}: ${done}/${todo.length}`);
      }
    })
  );
  fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify({ slug: b.slug, file: b.file, pages: n, ocr: 'tesseract psm6 300dpi gray' }, null, 2));
  console.log(`${b.slug}: ${n} pages, ${todo.length} OCR'd (${failed} failed) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
