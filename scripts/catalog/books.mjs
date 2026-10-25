// Parts-catalog PDFs the reader knows. Each book: where it is, the years it covers,
// which row layout it uses (parse.mjs), and how its model codes map to ours.
// Local copies Laken keeps; same books are on the H-D service portal (DATA_RIGHTS).

import os from 'node:os';
import path from 'node:path';

export const PDF_DIR = path.join(os.homedir(), 'Desktop/Stanky/parts-catalogs');
const DOWNLOADS = path.join(os.homedir(), 'Downloads');
// OCR text cache: outside the repo, one .txt per page. Page images are not kept.
export const OCR_DIR = path.join(os.homedir(), 'Developer/catalog-ocr');

// Shared by the H-D books: "FXS-80" is the FXS with the 80 cu in engine, not its own model.
// OCR mangles the 80 ("FLH-86", "FLH-8C", "FLH-S0", "FLH80"); no code in these books carries
// any other dash suffix, so any 2-3 character tail after the code is that marker.
const DROP_80 = (c) => c.replace(/-[0-9A-Z]{2,3}$/, '').replace(/^(F[LX][A-Z]*?)80$/, '$1');

export const BOOKS = [
  {
    slug: '1984-86-fx-fxst',
    file: 'FX/1984-86 FX-FXST Parts Catalog.pdf',
    title: '1984-86 FX-FXST Parts Catalog',
    from: 1984, to: 1986,
    layout: 'hd',
    code: DROP_80,
  },
  {
    slug: '1984-86-fxr',
    file: 'FXR/1984-86 FXR Parts Catalog.pdf',
    title: '1984-86 FXR Parts Catalog',
    from: 1984, to: 1986,
    layout: 'hd',
    code: DROP_80,
  },
  {
    slug: '1941-84-fl',
    file: '1941-1984.pdf',
    title: '1941-1984 FL Models Parts Catalog',
    from: 1941, to: 1984,
    layout: 'hd',
    // Codes the book uses for its models. "Classic" is the FLH Classic (p2-3 VIN tables: 1979
    // Classic, 1980 Classic, 1981+ "FLH Classic" AD) = FLHC, 1979-84 only (Laken, 2026-10-24).
    // FLHC 2018+ is the Softail Heritage Classic: same code, other era. "CLE" (1980) and
    // "FLH-80 Heritage" (1981) stay unmapped.
    codes: ['EL', 'FL', 'FLH', 'FLHS', 'FLF', 'FLHF', 'FLP', 'FLHP', 'FLHX', 'FLHC'],
    code: DROP_80,
    // OCR garbles the word (CIASSIC, GIASSIC, CLASSIE, C-ASSIC): C/G + "ASS"/"SSI". A list like
    // "66 to * - FL, FLH, FLH-80, Classic" names whichever existed each year, so Classic before
    // 1979 drops out (null) instead of sending the row to review.
    yearCode: (code, year) => {
      if (!(/^[CG]/.test(code) && /ASS|SSI/.test(code))) return code;
      return year >= 1979 && year <= 1984 ? 'FLHC' : null;
    },
  },
  {
    slug: '1954-78-xl',
    file: path.join(DOWNLOADS, '500148179-Harley-Davidson-1954-78-HD-XLH-XLCH-1000-Parts-Catalog.pdf'),
    title: '1954-78 XLH-XLCH-1000 Parts Catalog',
    // "Parts Catalog ... SPORTSTER Models XLH and XLCH"; VIN table also lists XLT. Rows reach back
    // to the K models (1954). "54 to *" lists name whichever existed that year (XL from 1957).
    from: 1954, to: 1978,
    printed: 1981, // "Copyright 1981", "HG-3.5M-4/81"
    layout: 'hd',
    codes: ['XL', 'XLH', 'XLCH', 'XLT', 'XLCR', 'XLA', 'XLR', 'KH', 'KHK'],
    code: DROP_80,
    // XL is the 1957 model; after that this book's XL is the XLH ("77 to * - XL, XLCH"
    // and "77 to * - XLH, XLCH" for the same kinds of parts). KH ended 1956.
    yearCode: (code, year) => (code === 'XL' && year >= 1958 ? 'XLH' : /^KH/.test(code) && year > 1956 ? null : code),
  },
  {
    slug: '1966-84-shovel-engine',
    file: path.join(DOWNLOADS, '99427-84.pdf'),
    title: 'Non-Current Shovelhead Engine Parts 1966-1984 (99427-84)',
    // DESCRIPTION | APPLICATION | P/N table. Application text: "41 to early 81 Big Twins",
    // "Late '81 to 84 FLH-80, Class", "78 to 84 1340 models", "66 to '80 1200cc Shovelhead".
    // Engine parts: "Big Twins" / "1340 models" / "Shovelhead" = every Shovelhead big twin we
    // have in that year (platforms fl, fx, fxr, touring with engine shovelhead or year <= 1983).
    from: 1941, to: 1984,
    printed: 1995, // page footer "7-95": replacement numbers up to -95 are valid
    layout: 'appl',
    codes: ['FL', 'FLH', 'FLHS', 'FLHC', 'FX'],
    code: DROP_80,
    // "FX" here is the FX family's engine ("78 to 84 FX, FL", "69 to 84 FLH-80, Classic, FX"),
    // not the kick-start FX model (ended 1979): '*FXFAM*' = that year's Shovel FX-frame bikes.
    yearCode: (code, year) => (/^CLASS/.test(code) ? (year >= 1979 && year <= 1984 ? 'FLHC' : null) : code === 'FX' ? '*FXFAM*' : code),
  },
  {
    slug: '1950-45ci',
    file: '1950 Spare Parts catalog.pdf',
    title: '1950 Spare Parts Catalog, 45 cu in solo and Servi-Car',
    // Cover: "This catalog covers 1940 to 1950 45" models and Servi-Cars"; rows reach back to 1924.
    from: 1920, to: 1950,
    layout: 'hd1950',
    // Model list on page 2: W, WL, WLD, WLDR solos; G, GA, GD, GDT Servi-Cars.
    solo: ['W', 'WL', 'WLD', 'WLDR'],
    servicar: ['G', 'GA', 'GD', 'GDT'],
    // Index: Servi-Car parts are printed pages 79-90 (PDF = printed + 2). PDF 81 and 93 also
    // carry other groups (stoplight switch, check strap), so rows there need an explicit qualifier.
    // Codes this book declares (most aren't hdchop vehicles yet).
    codes: ['W', 'WL', 'WLD', 'WLDR', 'WLA', 'WLC', 'G', 'GA', 'GD', 'GDT'],
    servicarPages: [82, 92],
    mixedPages: [81, 93],
    code: (c) => c,
  },
  {
    slug: '1942-wla',
    file: '1942 WLA Parts List.pdf',
    title: 'TM 10-1482 Parts List, Solo Model WLA (1942)',
    from: 1940, to: 1942,
    layout: 'wla',
    // "Number Used On" columns, left to right.
    columns: [{ year: 1940, code: 'WLA' }, { year: 1941, code: 'WLA' }, { year: 1942, code: 'WLA' }],
    codes: ['WLA'],
    code: (c) => c,
  },
];

// Laken's Google Drive copies (downloaded 2026-10-24 to ~/Downloads/hd-drive).
const DRIVE = path.join(DOWNLOADS, 'hd-drive');
BOOKS.push(
  {
    slug: '1961-76-fl-fx',
    file: path.join(DRIVE, 'FL-FX-1961-1976-Parts-Book.pdf'),
    title: '1961-76 Electra Glide FL/FLH, Super Glide FX/FXE Parts Catalog',
    // "parts lists cover all parts used from 1961 to 1976"
    from: 1961, to: 1976,
    layout: 'hd',
    codes: ['FL', 'FLH', 'FLHF', 'FLF', 'FLP', 'FLHP', 'FX', 'FXE'],
    code: DROP_80,
  },
  {
    slug: '1971-84-fx',
    file: path.join(DRIVE, '99455-83C-FX-Models-1971-1984.pdf'),
    title: '1971-84 FX Models Parts Catalog (99455-83C)',
    // "1971 to 1984 FX Models, except the FXR and FXST models"
    from: 1971, to: 1984,
    layout: 'hd',
    codes: ['FX', 'FXE', 'FXS', 'FXEF', 'FXWG', 'FXB', 'FXSB', 'FXDG'],
    // OCR reads F as E ("EXWG", "EXE"), B as 8 ("FXS8"), D as O/0 ("FX0G"), X as A/K ("FAWG").
    // A repair counts only when it lands on one of the book's codes.
    code: (c) => {
      const base = DROP_80(c);
      const fixed = base.replace(/^E(?=X)/, 'F').replace(/^F[AK]E?(?=W)/, 'FX').replace(/^FEX/, 'FX').replace(/8$/, 'B').replace(/^FX[0O]G$/, 'FXDG');
      return ['FX', 'FXE', 'FXS', 'FXEF', 'FXWG', 'FXB', 'FXSB', 'FXDG'].includes(fixed) ? fixed : base;
    },
  },
  {
    slug: '1970-xr-xlr',
    file: path.join(DRIVE, 'Sportster-XR-XLR-1970-Parts-Catalog.pdf'),
    title: '1970 Sportster XR/XLR Parts Catalog',
    from: 1970, to: 1970,
    layout: 'hd',
    codes: ['XR', 'XLR'],
    // The 1970 "XR" is the first-year (iron) XR-750 racer, our XR750; XLR (the
    // Sportster-engined racer) has no vehicle.
    code: (c) => (c === 'XR' ? 'XR750' : c),
  },
  {
    // Service manual, not a parts list: OCR'd for its spec tables (12_vehicle_specs); 11 skips it.
    slug: '1959-69-xl-service',
    file: path.join(DRIVE, '99484-69-Sportster-1959-1969-Service-Manual.pdf'),
    title: 'Sportster 1959-1969 Service Manual (99484-69)',
    from: 1959, to: 1969,
    layout: 'manual',
    codes: [],
    code: (c) => c,
  },
);

// ratbikeservice.com copies (downloaded 2026-10-24 to ~/Downloads/hd-ratbike, Laken's go).
const RATBIKE = path.join(DOWNLOADS, 'hd-ratbike');
BOOKS.push(
  {
    slug: '1941-78-fl-fx',
    file: path.join(RATBIKE, '1941-78 FL-FLH FX-FXE-FXS Parts Catalog.pdf'),
    title: '1941-78 FL/FLH - FX/FXE/FXS Parts Catalog',
    from: 1941, to: 1978,
    // The PDF's own text layer reads clean ("73 to • - FL, FLH, FX, FXS"); our OCR of its
    // faint page images doesn't. "•" is the asterisk.
    textLayer: true,
    layout: 'hd',
    codes: ['FL', 'FLH', 'FX', 'FXE', 'FXS', 'FLHS'],
    code: DROP_80,
  },
  {
    slug: '1971-80-fx',
    file: path.join(RATBIKE, '1971-80 FX SuperGlide Parts Catalog.pdf'),
    title: '1971-80 FX Super Glide Parts Catalog',
    from: 1971, to: 1980,
    layout: 'hd',
    codes: ['FX', 'FXE', 'FXS', 'FXEF', 'FXWG', 'FXB'],
    code: DROP_80,
  },
  {
    slug: '1980-fxwg-supp',
    file: path.join(RATBIKE, '1980 FXWG-80 Parts Catalog Supplement.pdf'),
    title: '1980 FXWG-80 Parts Catalog Supplement',
    from: 1980, to: 1980,
    layout: 'hd',
    codes: ['FXWG'],
    code: DROP_80,
  },
  {
    slug: '1972-89-xr750',
    file: path.join(RATBIKE, '1972-89 XR750 Parts Catalog.pdf'),
    title: '1972-89 XR750 Parts Catalog',
    from: 1972, to: 1989,
    layout: 'hd',
    codes: ['XR750', 'XR'],
    code: (c) => (c === 'XR' || c === 'XR-750' ? 'XR750' : c),
  },
  {
    slug: '1986-90-xlh',
    file: path.join(RATBIKE, '1986-90 XLH Parts Catalog.pdf'),
    title: '1986-90 XLH Parts Catalog',
    from: 1986, to: 1990,
    layout: 'hd',
    codes: ['XLH883', 'XLH1100', 'XLH1200', 'XLH883DLX', 'XLH883HUG'],
    code: (c) => c,
    // "XLH 883", "XLH 1100, 1200", "XLH 883/DLX", "XLH HUG": glue the size onto the code.
    // "883/DLX" lists the 883 and the 883 Deluxe; "XLH 883 A" (unknown) stays as written.
    usedFix: (s) => {
      let t = s
        .replace(/\bXLH\s*883\s*\/\s*DLX\b/g, 'XLH883, XLH883DLX')
        .replace(/\bXLH\s*HUG\b/g, 'XLH883HUG')
        .replace(/\bXLH\s*(883|1100|1200)\b(?!\s*A\b)/g, 'XLH$1');
      for (let i = 0; i < 3; i++) t = t.replace(/(XLH\d{3,4}),\s*(883|1100|1200)\b/g, '$1, XLH$2');
      return t;
    },
  },
  {
    slug: '1987-90-1340',
    file: path.join(RATBIKE, '1987-90 All 1340cc Models Parts Catalog.pdf'),
    title: '1987-90 All 1340cc Models Parts Catalog',
    from: 1987, to: 1990,
    layout: 'hd',
    codes: [],
    code: DROP_80,
  },
);

// H-D Service Information Portal reissues (2021) of pre-1991 catalogs, saved by
// ~/Developer/catalog-extract/fetch_pdfs.mjs (sections joined into one PDF, clean text layer).
// Layout 'vin': MODEL(S) column of model-identification code + year, decoded by `legend`
// (read off the page images; null = not a bike we list, e.g. sidecar rigs).
const PORTAL_PDF = path.join(os.homedir(), 'Developer/catalog-extract/pdf');
BOOKS.push(
  {
    slug: '1984-86-flt',
    file: path.join(PORTAL_PDF, '1984-1986-flt-models.pdf'),
    title: '1984-1986 FLT Models Parts Catalog (99438-86B)',
    from: 1984, to: 1986,
    layout: 'vin',
    textLayer: true,
    // Page-foot legend: DB = FLTC Classic (84-86); DD = FLHTC Classic 84-85 but FLHT in 86;
    // DJ86 = FLHTC Classic; DE = FLHTC Classic Sidecar, DH = FLTC Classic Sidecar (rigs: skipped).
    legend: {
      DB84: 'FLTC', DB85: 'FLTC', DB86: 'FLTC',
      DD84: 'FLHTC', DD85: 'FLHTC', DD86: 'FLHT', DJ86: 'FLHTC',
      DE84: null, DE85: null, DE86: null, DH84: null, DH85: null, DH86: null,
    },
    codes: ['FLTC', 'FLHTC', 'FLHT'],
    code: (c) => c,
  },
  {
    slug: '1979-85-xl',
    file: path.join(PORTAL_PDF, '1979-1985-sportster.pdf'),
    title: '1979-1985 XL Models Parts Catalog (99451-85A)',
    from: 1979, to: 1985,
    // Classic "79 to 85-XL, XLCH, XLS, XLX" used-on text in the reissue's clean columns.
    layout: 'hd',
    textLayer: true,
    codes: ['XL', 'XLH', 'XLCH', 'XLS', 'XLX', 'XLHA', 'XLSA', 'XR1000'],
    code: (c) => (c === 'XR-1000' || c === 'XR-' ? 'XR1000' : c), // the book writes "XR-1000"; a wrapped cell leaves "XR-"
    // As in the 1954-78 book, "XL" is the XLH. XLHA / XLSA = the 1982 25th Anniversary
    // XLH / XLS (their own rows only in 1982).
    yearCode: (code, year) => (code === 'XL' || code === 'XLHA' ? 'XLH' : code === 'XLSA' ? 'XLS' : code),
  },
);

export const bookBySlug = (slug) => BOOKS.find((b) => b.slug === slug);
export const pdfPath = (b) => (path.isAbsolute(b.file) ? b.file : path.join(PDF_DIR, b.file));
export const ocrDir = (b) => path.join(OCR_DIR, b.slug);
