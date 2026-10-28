# scripts/catalog/pdf_words.py
#
# Word boxes for every page of a PDF, for table parsers that need columns
# (scripts/etl/17_vtwin_oem.mjs). pdftotext -bbox crashes on the V-Twin catalog,
# so this uses pdfplumber. One file per page: <out>/NNNN.json =
#   [[text, x0, x1, top, bottom, font_size, bold], ...]   (points, origin top-left)
# Pages already cached are skipped. Keep <out> outside the repo (catalog text).
#
# Usage: python3 -I scripts/catalog/pdf_words.py <pdf> <out_dir> [first_page last_page]
import json
import os
import sys

import pdfplumber

pdf, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
with pdfplumber.open(pdf) as doc:
    first = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    last = int(sys.argv[4]) if len(sys.argv) > 4 else len(doc.pages)
    for i in range(first - 1, min(last, len(doc.pages))):
        f = os.path.join(out, f'{i + 1:04d}.json')
        if os.path.exists(f):
            continue
        page = doc.pages[i]
        words = page.extract_words(x_tolerance=1.5, y_tolerance=2, extra_attrs=['size', 'fontname'])
        bold = lambda w: int(any(k in w['fontname'] for k in ('Bold', 'Black', 'Heavy')))
        rows = [[w['text'], round(w['x0'], 1), round(w['x1'], 1), round(w['top'], 1), round(w['bottom'], 1), round(w['size'], 1), bold(w)] for w in words]
        with open(f, 'w') as fh:
            json.dump(rows, fh)
        page.flush_cache()
