# scripts/catalog/vtwin_cables_check.py
#
# Checks the hand-reviewed V-Twin cable/line length list (scripts/catalog/specs/vtwin_cable_lengths.csv)
# against the catalog and the app DB. Read-only.
#   1. every row's evidence text is on its cited page (word cache from pdf_words.py,
#      stacked fractions joined back as 7-3/4")
#   2. every H-D number is printed on that page
#   3. each H-D number's oem_parts description and current fitment years, for comparison
# Writes reports/vtwin_cables_check_<ts>.txt and reports/vtwin_cables_<ts>.md.
#
# Usage: APP_DATABASE_URL=... python3 -I scripts/catalog/vtwin_cables_check.py [words_dir]
import csv, json, os, re, subprocess, sys, tempfile, time, collections

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WD = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'hdchop_vtwin', 'words')
SRC = os.path.join(ROOT, 'scripts', 'catalog', 'specs', 'vtwin_cable_lengths.csv')
TS = time.strftime('%Y%m%d_%H%M%S')
FR = re.compile(r'^\d{1,2}[/•]\d{1,2}$')

def page_text(p):
    ws = [list(w) for w in json.load(open(os.path.join(WD, f'{p:04d}.json')))]
    fr = [w for w in ws if FR.match(w[0])]
    rest = [w for w in ws if not FR.match(w[0])]
    for f in fr:  # stacked fraction between a number and an inch mark, half a line off
        best = None
        for a in rest:
            if not (0.5 < abs(a[3] - f[3]) <= 7) or not re.search(r'\d$', a[0]) or not (-1.5 <= f[1] - a[2] <= 4): continue
            if not any(abs(b[3] - a[3]) < 2.5 and re.match(r'^(["”]|’’)', b[0]) and -1.5 <= b[1] - f[2] <= 4 for b in rest): continue
            if best is None or abs(a[3] - f[3]) < best[0]: best = (abs(a[3] - f[3]), a)
        if best: best[1][0] += '-' + f[0].replace('•', '/')
        else: rest.append(f)
    rest.sort(key=lambda w: (w[3], w[1]))
    lines = []
    for w in rest:
        if lines and abs(lines[-1][0] - w[3]) < 2.5: lines[-1][1].append(w)
        else: lines.append([w[3], [w]])
    return [' '.join(x[0] for x in sorted(L, key=lambda w: w[1])) for _, L in lines]

def norm(s):
    s = s.replace('—', '-').replace('’’', '”').replace('"', '”')
    s = re.sub(r'\s*”', '”', s)
    return re.sub(r'[\s,;]+', ' ', s).strip().lower()

rows = list(csv.DictReader(open(SRC, encoding='utf-8')))
cache, problems = {}, []
for i, r in enumerate(rows, 2):
    pages = [int(p) for p in r['page'].split('+')]
    for p in pages:
        cache.setdefault(p, [norm(l) for l in page_text(p)])
    ev = norm(r['evidence'])
    if not any(ev in l for p in pages for l in cache[p]):
        problems.append(f'line {i}: evidence not found on p{r["page"]}: {r["evidence"]}')
    if r['oem'] and not any(r['oem'].lower() in ' '.join(cache[p]).replace('- ', '-') for p in pages):  # numbers can wrap
        problems.append(f'line {i}: {r["oem"]} not printed on p{r["page"]}')

# app DB: description + current fitment years per model family
oems = sorted({r['oem'] for r in rows if r['oem']})
keys = [o.replace('-', '').upper() for o in oems]
db = {}
url = os.environ.get('APP_DATABASE_URL')
if url and keys:
    arr = '{' + ','.join(keys) + '}'
    sql = f"""SELECT p.oem_number, p.description_clean,
      coalesce((SELECT string_agg(DISTINCT f.source, '/') FROM fitment f WHERE f.oem_number = p.oem_number), ''),
      coalesce((SELECT min(v.year)::text || '-' || max(v.year)::text FROM fitment f JOIN vehicles v USING (vehicle_id)
                WHERE f.oem_number = p.oem_number), ''),
      coalesce((SELECT string_agg(DISTINCT v.platform, ' ') FROM fitment f JOIN vehicles v USING (vehicle_id)
                WHERE f.oem_number = p.oem_number), '')
      FROM oem_parts p WHERE p.oem_number = ANY('{arr}'::text[])"""
    out = subprocess.run(['psql', url, '-AtF', '\t', '-c', sql], capture_output=True, text=True, check=True).stdout
    for line in out.splitlines():
        k, desc, src, yrs, plat = (line.split('\t') + [''] * 5)[:5]
        db[k] = {'desc': desc, 'src': src, 'years': yrs, 'platforms': plat}

    # numbers the app lacks: show same-base siblings (38607-87 -> 38607-87A)
    for o in oems:
        k = o.replace('-', '').upper()
        if k in db: continue
        base = re.sub(r'[A-Z]+$', '', k)
        out = subprocess.run(['psql', url, '-At', '-c', f"SELECT string_agg(oem_display, ' ') FROM oem_parts WHERE oem_number LIKE '{base}%'"],
                             capture_output=True, text=True, check=True).stdout.strip()
        if out: db[k] = {'desc': f'not in app; sibling {out}', 'src': '', 'years': '', 'platforms': '', 'sibling': True}

by_basis = collections.Counter(r['basis'] for r in rows)
by_conf = collections.Counter(r['confidence'] for r in rows)
by_cable = collections.Counter(r['cable'].split(' (')[0] for r in rows)
missing = [o for o in oems if o.replace('-', '').upper() not in db or db[o.replace('-', '').upper()].get('sibling')]

rep = [f'V-Twin cable/line lengths check {TS}', f'source: {SRC}', f'rows: {len(rows)}; H-D numbers: {len(oems)}; '
       f'in oem_parts: {len(oems) - len(missing)}', f'by basis: {dict(by_basis)}', f'by confidence: {dict(by_conf)}',
       f'by cable: {dict(by_cable)}', '', f'evidence problems: {len(problems)}', *problems, '',
       f'H-D numbers not in oem_parts ({len(missing)}): {" ".join(missing)}']
open(os.path.join(ROOT, 'reports', f'vtwin_cables_check_{TS}.txt'), 'w').write('\n'.join(rep) + '\n')

# readable list
md = ['# V-Twin catalog: stock cable and line lengths (reviewed)', '',
      f'Built {TS} from `scripts/catalog/specs/vtwin_cable_lengths.csv` ({len(rows)} rows, {len(oems)} H-D numbers). '
      'Every row was read off its catalog page by hand; this check confirmed each quoted line is on that page. '
      'Not loaded anywhere: needs a DATA_RIGHTS decision.', '',
      '**Basis:** `stock_stated` = row says Stock next to the H-D number; `oem_row` = H-D number and length on one row of a '
      'stock-replacement table; `replaces` = "Replaces <H-D no.>" note with the length; `vt_join` = H-D number and length '
      'on different rows tied by the same V-Twin number; `stock_no_oem` = stock length for a model-year, no H-D number.', '',
      f'Evidence problems: {len(problems)}. H-D numbers not in the app: {len(missing)} ({" ".join(missing) or "none"}).', '']
for cable in ['clutch', 'throttle', 'speedometer', 'tachometer', 'battery cable', 'front brake hose']:
    rs = [r for r in rows if r['cable'].split(' (')[0] == cable]
    if not rs: continue
    md += [f'## {cable.capitalize()} ({len(rs)})', '',
           '| H-D no. | Length | End / nut | Years | Models | Basis | Conf. | Page | App has | Note |',
           '|---|---|---|---|---|---|---|---|---|---|']
    for r in sorted(rs, key=lambda r: (r['oem'] == '', r['oem'], float(r['length_in']))):
        d = db.get(r['oem'].replace('-', '').upper(), {})
        app = f"{d['desc']}; {d['years']} {d['platforms']}".strip('; ') if d else ('not in app' if r['oem'] else '')
        kind = r['cable'][len(cable):].strip(' ()')
        md.append('| ' + ' | '.join(x.replace('|', '/') for x in [r['oem'] or '—', r['length_as_printed'], ', '.join(filter(None, [kind, r['end_or_nut']])),
                  r['years'], r['models'], r['basis'], r['confidence'], r['page'], app, r['note']]) + ' |')
    md.append('')
md += ['## Left out', '',
       '- Every "+2” … +17” Ext / over stock" row (extended lengths, not stock) and V-Twin-only custom lengths.',
       '- p1001 36-8078 59.25” / 59.5” for 2004-up XL: p1000 lists 36-8078 as the +4” extension, so not stock.',
       '- p837 / p1003 front brake cable "Replaces 45073-51, 60” long, must be cut": bulk length, not a finished stock length.',
       '- Stock throttle/idle rows with H-D numbers but no length (p113, p416, p736, p1000, p1001): fitment only, already handled by 17_vtwin_oem.',
       '- Brake line application charts (p276, p277, p921 top): V-Twin numbers by model, no lengths or H-D numbers.',
       '- 2020-23 Touring clutch cables 37200437 / 37200439 / 37200440 (p114): lengths only reachable through the p113 quick-connect '
       'upper-section rows by V-Twin number, and the app names 37200437 the lower cable, so the join is not trusted.',
       '- V-Twin numbers reused across tables (e.g. 36-2464 is "56324-81 Stock" on p416 and "33” S&S" on p414), so no other cross-table joins.']
open(os.path.join(ROOT, 'reports', f'vtwin_cables_{TS}.md'), 'w').write('\n'.join(md) + '\n')
print('\n'.join(rep[:7]))
print(f'evidence problems: {len(problems)}')
for p in problems: print(' ', p)
print('missing from oem_parts:', ' '.join(missing) or 'none')
print(f'reports/vtwin_cables_{TS}.md')
