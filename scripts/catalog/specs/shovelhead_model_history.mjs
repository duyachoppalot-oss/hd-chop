// H-D "Shovelhead Model History" table, 99427-84 Non-Current Shovelhead Engine
// Parts (7-95), PDF pages 13-14 (printed pages 11-12). Transcribed from the page
// images, one entry per printed row that states years + engine (+ transmission).
//
// code: our vehicles.model_code ("FLH 80" -> FLH with ci 80; "-80" codes collapse
// to the base code, see books.mjs DROP_80). half: the printed year is "1/2"
// (mid-year change), so both specs apply that year.
// speeds null = the row prints no transmission.
// hp: as printed for the model (FL low compression 57 hp, FLH high compression 66 hp;
// the FL 1972-80 row continues the same low-compression motor).
// Notes are short paraphrases of the row's remarks.

export const SOURCE = {
  key: '99427-84:model-history',
  title: '99427-84 Non-Current Shovelhead Engine Parts (7-95), Shovelhead Model History',
  pages: 'PDF 13-14 (printed 11-12)',
};

export const ROWS = [
  { label: 'FL', code: 'FL', from: 1966, to: 1971, ci: 74, speeds: 4, hp: '57 hp', note: 'Low compression, 57 hp; public, police, commercial, Shrine' },
  { label: 'FL', code: 'FL', from: 1972, to: 1980, ci: 74, speeds: 4, hp: '57 hp', note: 'Police, commercial, Shrine only' },
  { label: 'FLH', code: 'FLH', from: 1966, to: 1980, ci: 74, speeds: 4, hp: '66 hp', note: 'High compression, 66 hp' },
  { label: 'FLHS', code: 'FLHS', from: 1977, to: 1977, ci: 74, speeds: null, note: '"Classic Brown" and other colors' },
  { label: 'FLHS 80', code: 'FLHS', from: 1980, to: 1980, ci: 80, speeds: 4, note: 'Stripped-down FLH 80' },
  // Printed under the FLHS 80 block without its own model label; "first 1340cc"
  // and 1978 1/2 are the FLH-80 (FL book: "FLH-80" from 78).
  { label: 'FLH 80 (row unlabelled)', code: 'FLH', from: 1978, to: 1984, half: 'from', ci: 80, speeds: 4, note: 'First 1340 cc; belt drive 1983-84', review: 'row has no model label' },
  { label: 'FLH 80 CLASSIC', code: 'FLHC', from: 1979, to: 1984, ci: 80, speeds: 4, note: 'Black wrinkle cases and inner primary; deluxe Tour Pak' },
  { label: 'FLT 80', code: 'FLT', from: 1980, to: 1983, ci: 80, speeds: 5, note: 'First rubber-mount 1340; first 5-speed; enclosed chain; frame-mounted fairing' },
  { label: 'FLT 80 CLASSIC', code: 'FLTC', from: 1982, to: 1982, ci: 80, speeds: 5, note: 'See FLH 80 Classic', review: 'speeds taken from FLT 80 (row prints none)' },
  { label: 'FLHT & CLASSIC', code: 'FLHT', from: 1983, to: 1984, ci: 80, speeds: 5, note: 'Rubber mounted, single headlight, chain drive' },
  { label: 'FLHT & CLASSIC', code: 'FLHTC', from: 1983, to: 1984, ci: 80, speeds: 5, note: 'Rubber mounted, single headlight, chain drive' },
  { label: 'FLH 80 HERITAGE', code: null, from: 1981, to: 1981, ci: 80, speeds: 4, note: 'Olive drab and orange; black engine; leather bags', review: 'no model code (catalog writes "FLH-80 Heritage")' },
  { label: 'FLHF', code: 'FLHF', from: 1982, to: 1983, ci: 80, speeds: null, note: 'FL-style foot controls with footboards' },
  { label: 'FX', code: 'FX', from: 1971, to: 1977, ci: 74, speeds: 4, note: 'Original Super Glide, kickstart only' },
  { label: 'FXE', code: 'FXE', from: 1974, to: 1984, ci: 74, speeds: 4, note: 'Super Glide, electric start' },
  { label: 'FXE 80', code: 'FXE', from: 1981, to: 1984, ci: 80, speeds: null, note: '' },
  { label: 'FXEF', code: 'FXEF', from: 1978, to: 1980, ci: 74, speeds: 4, note: 'Fat Bob split tanks' },
  { label: 'FXEF 80', code: 'FXEF', from: 1980, to: 1983, ci: 80, speeds: 4, note: 'No kicker' },
  { label: 'FXS', code: 'FXS', from: 1977, to: 1979, half: 'to', ci: 74, speeds: 4, note: 'Original Low Rider, 27 in seat' },
  { label: 'FXS 80', code: 'FXS', from: 1979, to: 1982, half: 'from', ci: 80, speeds: null, note: '' },
  { label: 'FXB 80', code: 'FXB', from: 1980, to: 1982, ci: 80, speeds: 4, note: 'Sturgis, dual belt drive' },
  { label: 'FXSB', code: 'FXSB', from: 1983, to: 1984, ci: 80, speeds: 4, note: "Low Rider; '83 double belt, '84 single belt" },
  { label: 'FXWG 80', code: 'FXWG', from: 1980, to: 1984, ci: 80, speeds: 4, note: 'Wide Glide front end, forward controls' },
  { label: 'FXR', code: 'FXR', from: 1982, to: 1983, ci: 80, speeds: 5, note: 'First rubber-mount FX' },
  { label: 'FXRS', code: 'FXRS', from: 1982, to: 1983, ci: 80, speeds: 5, note: 'Rubber mount, no kicker' },
  { label: 'FXRT', code: 'FXRT', from: 1983, to: 1983, ci: 80, speeds: 5, note: 'Frame-mounted fairing, hard bags' },
  { label: 'FXDG DISC GLIDE', code: 'FXDG', from: 1983, to: 1983, ci: 80, speeds: 4, note: 'Dual belt, disc rear wheel' },
];

// 74 ci = 1200 cc, 80 ci = 1340 cc (the book's own pairing: "1200cc ... 1340cc").
export const CC = { 74: 1200, 80: 1340 };
