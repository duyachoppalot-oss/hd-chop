// Transmission speeds for the first Evolution big twins, from three H-D parts
// catalogs (books in scripts/catalog/books.mjs). None prints the engine size, so
// these rows carry speeds only (ci null).
//
// 99438-86B 1984-1986 FLT Models (PDF text layer), Transmission Gears, PDF page 49:
//   FOURTH GEAR mainshaft + countershaft "ALL", FIFTH GEAR countershaft "ALL", FIFTH GEAR
//   mainshaft DB84-86, DD84-86, DJ86. Model codes from the page-foot legend (PDF 5):
//   DB = FLTC Classic, DD84/85 = FLHTC Classic, DD86 = FLHT, DJ86 = FLHTC Classic
//   (DE / DH = the sidecar rigs). 1984 FLHT / FLHTC are already in 99427-84 (80 ci, 5-speed).
// 99439-86A 1984-1986 FXR Models (PDF text layer), Transmission Gears, PDF page 43:
//   FIFTH GEAR countershaft "84 to 86-All Models"; FIFTH GEAR mainshaft "Early 84" /
//   "Late 84-FXRS, FXRT", "85 to 86-All Models". Models the book lists, years as its rows
//   print them: FXRS, FXRT 84-86; FXRDG "Late 84 to 86"; FXRC late 85 / late 86; FXRD 86;
//   FXR 86 ("TRANSMISSION, five-speed, rear chain drive ... Late 86 to * - FXR").
// 1984-86 FX-FXST Parts Catalog (OCR), sections FX15/FX15A "4 SPEED" (PDF 40-42) and
//   FX16/FX16A "5 SPEED" (PDF 44-46): 4-speed rows "84 & 85 - FXST; 85 & 86 - FXWG,
//   FXSB, FXEF"; 5-speed gears "86 to * - FXST". The 5-speed rows name FXST only, though
//   other rows in the book list "FXST, FXSTC, FLST" separately: 1986 FXSTC / FLST left empty.

export const SOURCE = {
  key: 'hd-1984-86-evo:transmission',
  title: '1984-86 FLT (99438-86B), FXR (99439-86A) and FX-FXST Parts Catalogs, Transmission',
  pages: 'FLT PDF 49 + legend PDF 5; FXR PDF 43; FX-FXST PDF 40-46',
  coverageOnly: true,
};

const flt = (code, from, to) => ({ label: `FLT book ${code}`, code, from, to, ci: null, speeds: 5, note: 'Five-speed (FLT parts catalog)' });
const fxr = (code, from, to) => ({ label: `FXR book ${code}`, code, from, to, ci: null, speeds: 5, note: 'Five-speed (FXR parts catalog)' });
const fx = (code, from, to, speeds) => ({ label: `FX-FXST book ${code}`, code, from, to, ci: null, speeds, note: `${speeds === 5 ? 'Five' : 'Four'}-speed (FX-FXST parts catalog)` });

export const ROWS = [
  flt('FLTC', 1984, 1986), flt('FLHTC', 1985, 1986), flt('FLHT', 1986, 1986),
  fxr('FXRS', 1984, 1986), fxr('FXRT', 1984, 1986), fxr('FXRDG', 1984, 1986), fxr('FXRC', 1985, 1986), fxr('FXRD', 1986, 1986), fxr('FXR', 1986, 1986),
  fx('FXST', 1984, 1985, 4), fx('FXST', 1986, 1986, 5),
  fx('FXWG', 1985, 1986, 4), fx('FXSB', 1985, 1986, 4), fx('FXEF', 1985, 1986, 4),
];

export const CC = {};
