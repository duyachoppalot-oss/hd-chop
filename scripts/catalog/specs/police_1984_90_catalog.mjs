// H-D 1984.5-1990 FXRP / FLHTP police parts catalog 99545-90 (book 1984-90-police
// in scripts/catalog/books.mjs; PDF text layer).
//
// Printed: Cylinder, Head and Valves - V2 Evolution, PDF page 7: ENGINE ASSEMBLY,
// complete (1340cc) for "87-FXRP, FLHTP", "Early 88-FLHTP", "Late 88-FLHTP",
// "89 to 90-FXRP", "90 to 90-FLHTP", "90 to 90-FXRP". Transmission Gears, PDF page
// 67: FOURTH GEAR and FIFTH GEAR, countershaft "Late 84 to 90-FXRP, FLHTP"; FIFTH
// GEAR, mainshaft "85 to 90-FXRP, FLHTP" -> 5-speed.
//
// Size only in the years an engine row prints it (no FXRP engine row for 1988, none
// before 1987). Late 1984 is left out (part-year).

export const SOURCE = {
  key: '99545-90:police',
  title: '99545-90 FXRP / FLHTP Police Parts Catalog 1984.5-1990, Engine + Transmission Gears',
  pages: 'PDF 7 (engine assemblies), PDF 67 (transmission gears)',
  coverageOnly: true,
};

export const ROWS = [
  { label: 'FLHTP', code: 'FLHTP', from: 1985, to: 1986, ci: null, speeds: 5, note: 'Five-speed' },
  { label: 'FLHTP', code: 'FLHTP', from: 1987, to: 1990, ci: 80, speeds: 5, note: '1340 cc engine; five-speed' },
  { label: 'FXRP', code: 'FXRP', from: 1985, to: 1986, ci: null, speeds: 5, note: 'Five-speed' },
  { label: 'FXRP', code: 'FXRP', from: 1987, to: 1987, ci: 80, speeds: 5, note: '1340 cc engine; five-speed' },
  { label: 'FXRP', code: 'FXRP', from: 1988, to: 1988, ci: null, speeds: 5, note: 'Five-speed', review: 'no FXRP engine row printed for 1988' },
  { label: 'FXRP', code: 'FXRP', from: 1989, to: 1990, ci: 80, speeds: 5, note: '1340 cc engine; five-speed' },
];

export const CC = { 80: 1340 };
