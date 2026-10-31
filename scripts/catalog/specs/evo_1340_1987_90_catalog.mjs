// H-D "1987-90 All 1340cc Models Parts Catalog" (book 1987-90-1340 in
// scripts/catalog/books.mjs). Transcribed from the page images.
//
// Printed: General Information, PDF page 2: "parts for the 1987 and Later 1340cc
// models ... all FLT, FXR and Softail model motorcycles", with the VIN Model
// Designation table (FLT: FLTC, FLHT, FLHTC, FLTC-U, FLHTC-U, FLHS; FXR: FXR, FXRS,
// FXRT, FXRS-SP, FXRC, FXLR, FXLR-CONEM; Softail: FXST, FLST/C, FXSTC, FXSTS, FLSTF)
// and model years H-1987 .. L-1990. Engine assemblies print "(1340 cc)" (PDF 5, 7).
// Transmission Gears, PDF page 48: FOURTH and FIFTH GEAR, mainshaft and
// countershaft, "87*-ALL" in the FLT, FXR and Softail columns -> 5-speed.
//
// Rows are bounded to the book's model years (1987-90); a row lands only where the
// (code, year) is already a vehicle. Not in the table (left empty): FXRD, FLT 1990,
// police FXRP / FLHTP (see police_1984_90_catalog.mjs).

export const SOURCE = {
  key: '1987-90-1340:general-info',
  title: '1987-90 All 1340cc Models Parts Catalog, General Information + Transmission Gears',
  pages: 'PDF 2 (VIN table), PDF 48 (transmission gears)',
  coverageOnly: true,
};

const NOTE = '1340 cc Evolution; five-speed';
const row = (label, code) => ({ label, code, from: 1987, to: 1990, ci: 80, speeds: 5, note: NOTE });

export const ROWS = [
  row('FLTC', 'FLTC'), row('FLHT', 'FLHT'), row('FLHTC', 'FLHTC'), row('FLTC-U', 'FLTCU'), row('FLHTC-U', 'FLHTCU'), row('FLHS', 'FLHS'),
  row('FXR', 'FXR'), row('FXRS', 'FXRS'), row('FXRT', 'FXRT'), row('FXRS-SP', 'FXRS-SP'), row('FXRC', 'FXRC'), row('FXLR', 'FXLR'),
  row('FXST', 'FXST'), row('FLST/C', 'FLST'), row('FLST/C', 'FLSTC'), row('FXSTC', 'FXSTC'), row('FXSTS', 'FXSTS'), row('FLSTF', 'FLSTF'),
];

// The book's own size: 1340 cc; 80 ci as 99427-84 pairs it ("80 ... 1340cc").
export const CC = { 80: 1340 };
