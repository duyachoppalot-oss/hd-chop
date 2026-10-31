// H-D "Non-Current Shovelhead Engine Parts 1966-1984" (99427-84, printed 7-95; book
// 1966-84-shovel-engine in scripts/catalog/books.mjs). Reference pages transcribed from
// the page images (PDF 11-14 = printed pages 9-12); the parts lists (PDF 3-10) are read by
// scripts/etl/11_catalog_books.mjs. Values restated as data; nothing here is shown verbatim.
// Not loaded anywhere yet (see reports/shovel_99427-84_documented.md for what each set could feed).

export const SOURCE = {
  key: '99427-84',
  title: 'Non-Current Shovelhead Engine Parts 1966-1984 (99427-84)',
  pages: 'PDF 11 (history), 12 (VINs), 13-14 (model history)',
};

// PDF 11, "Shovelhead History - Highlights at a Glance": engine changes by model year.
// late = the change came in mid-year ("Late '77"); half = "1978 1/2".
export const HISTORY = [
  { year: 1966, changes: ['first Shovelhead year', '12 volt generator'] },
  { year: 1967, changes: ['last iron oil pump', 'Tillotson carburetor'] },
  { year: 1968, changes: ['first aluminum oil pump'] },
  { year: 1969, changes: ['new left main bearing', 'last distributor ignition'] },
  { year: 1970, changes: ['new gear shaft', 'first alternator', 'new crankcases and gear cover'] },
  { year: 1971, changes: ['Bendix carburetor', 'first FX'] },
  { year: 1973, changes: ['full-flow oil system', 'new engine cases, gear cover and oil pump', 'faster oil pump', 'new gear speed'] },
  { year: 1974, changes: ['shorter connecting rods, relocated piston pin'] },
  { year: 1975, changes: ['long-reach spark plug (5R6A)'] },
  { year: 1976, changes: ['Keihin carburetor'] },
  { year: 1977, late: true, changes: ['new gear profile for cam, pinion and breather gears'] },
  { year: 1978, half: true, changes: ['first 1340 cc', 'first emissions-certified engine', 'new cylinder studs with load spreaders, thicker cylinder flanges',
    'new intake manifold, cylinder head flanges and manifold seals', 'first electronic ignition'] },
  { year: 1979, late: true, changes: ['new rocker boxes with one short stud'] },
  { year: 1979, changes: ['last steel valve guides'] },
  { year: 1980, changes: ['short cast iron valve guides', 'new electronic ignition'] },
  { year: 1981, late: true, changes: ['"oil control" engine: long cast iron valve guides with seals, tappet drain hoses to cylinder bases, new piston/ring package',
    'new oil pump with revised pressure', 'common tapered flywheels'] },
  { year: 1982, changes: ['Zytel (plastic) breather gear'] },
  { year: 1982, late: true, changes: ['oil control engine update: tappet blocks with straight-through drain vents, restricted oil to connecting rods and top end',
    'oil pump pressure-control change'] },
];

// PDF 12, "VINs for the 70's": two-character model code in the VIN.
export const VIN_70S = [
  ['1A', 'FL-1200'], ['2A', 'FLH-1200'], ['2C', 'FX-1200'], ['9D', 'FXE-1200'], ['5E', 'FXEF-1200'], ['6E', 'FXEF-80'],
  ['7E', 'FLHS'], ['2F', 'FXS-1200'], ['3G', 'FLH-80'], ['5G', 'FLT'], ['6G', 'FXE-80'], ['7G', 'FXS-80'], ['9G', 'FXWG'],
  ['1H', 'FXB (Sturgis)'], ['3H', 'FLH-80 Classic'], ['5H', 'FLHS-80'], ['6H', 'FL-80 (low compression)'], ['7H', 'FLH Police'],
  ['8H', 'FLH Shrine'], ['9H', 'FLH-80 Police'], ['1K', 'FLH-80 Shrine'],
].map(([code, model]) => ({ code, model }));

// PDF 12, "VINs for the 80's": three-character model designation per year. 1984 has two
// columns, dry and wet clutch (Shovelhead); 'EVO' = that model had the Evolution engine in
// 1984; null = model not built that year. code: our model code where it maps cleanly.
const v = (model, code, y81, y82, y83, dry84, wet84) => ({ model, code, y1981: y81, y1982: y82, y1983: y83, y1984dry: dry84, y1984wet: wet84 });
export const VIN_80S = [
  v('FLH-80', 'FLH', 'AAK', 'AAK', 'AAK', 'AAK3', 'AAK2'),
  v('FLHP Police', 'FLHP', 'ABK', 'ABK', 'ABK', 'ABK3', 'ABK2'),
  v('FLHP Shrine', null, 'ACK', 'ACK', 'ACK', 'ACK3', 'ACK2'),
  v('FLH Classic', 'FLHC', 'ADK', 'ADK', null, null, null),
  v('FLHX Special', 'FLHX', null, null, null, 'AEK3', 'AEK2'),
  v('FLHX with sidecar', null, null, null, null, 'AFK3', 'AFK2'),
  v('FLH Classic with sidecar', null, 'AGK', 'AGK', null, null, null),
  v('FLHP Police Deluxe', null, 'AHK', 'AHK', 'AHK', 'AHK3', 'AHK2'),
  v('FLH Heritage', null, 'AJK', null, null, null, null),
  v('FLHS', 'FLHS', 'AKK', 'AKK', 'AKK', null, 'AKK2'),
  v('FLHP Shrine', null, null, null, 'ALK', 'ALK3', 'ALK2'),
  v('FXE Super Glide', 'FXE', 'BAK', 'BAK', 'BAK', 'BAK3', null),
  v('FXE Fat Bob, dual exhaust', null, null, null, null, 'BBK3', 'BBK2'),
  v('FXEF rigid mount', 'FXEF', 'BBK', null, null, null, 'BBL1'),
  v('FXS Low Rider (FXRS)', 'FXS', 'BCK', 'BCK', null, null, null),
  v('FXB Sturgis', 'FXB', 'BDK', 'BDK', null, null, null),
  v('FXWG Wide Glide', 'FXWG', 'BEK', 'BEK', 'BEK', 'BEK3', 'BEK2'),
  v('FXSB Low Rider (belt)', 'FXSB', null, null, 'BFK', 'BFK3', 'BFK2'),
  v('FXDG Disc Glide', 'FXDG', null, null, 'BGK2', null, null),
  v('FLT Tour Glide', 'FLT', 'AEK', 'DAK', 'DAK', null, null),
  v('FLTC', 'FLTC', 'AFK', 'DBK', 'DBL', 'EVO', 'EVO'),
  v('FLHT', 'FLHT', null, null, 'DCK', null, null),
  v('FLHTC', 'FLHTC', null, null, 'DDK', 'EVO', 'EVO'),
  v('FLHTC with sidecar', null, null, null, 'DEK', 'EVO', 'EVO'),
  v('FLHTP Police (chain)', 'FLHTP', null, null, 'DFK', 'EVO', 'EVO'),
  v('FLHT Shrine (chain)', null, null, null, 'DGK', 'EVO', 'EVO'),
  v('FLTC with sidecar', null, null, null, 'DHK', 'EVO', 'EVO'),
  v('FXR (became the 1984 Disc Glide)', 'FXR', null, 'EAK', 'EAK', null, null),
  v('FXRS Low Glide', 'FXRS', null, 'EBK', 'EBK', 'EVO', 'EVO'),
  v('FXRT', 'FXRT', null, null, 'ECK2', 'EVO', 'EVO'),
  v('FXRP', 'FXRP', null, null, 'EDL2', 'EVO', 'EVO'),
];

// PDF 13-14, "Shovelhead Model History": per model, years, engine (ci, OHV), speeds, horsepower
// where printed, and what set the model apart. Year ranges as printed ("1978 1/2" -> from 1978, half).
const m = (model, codes, from, to, ci, speeds, extra) => ({ model, codes, from, to, ci, speeds, hp: null, notes: [], ...extra });
export const MODELS = [
  m('FL', ['FL'], 1966, 1971, 74, 4, { hp: 57, notes: ['low-compression motor', 'for public, police, commercial and Shrine use'] }),
  m('FL', ['FL'], 1972, 1980, 74, 4, { hp: 57, notes: ['police, commercial and Shrine only'] }),
  m('FLH', ['FLH'], 1966, 1980, 74, 4, { hp: 66, notes: ['high-compression motor', '1966-69 flat cam cover ("slabside")', '1970-84 cam cover with ignition breaker ("cone motor"), first alternator',
    '1966-76 windshield standard, fairing optional', '1976 Liberty Edition paint and trim', '1977 cast wheels available (black or aluminum)', '1977-80 fairing standard'] }),
  m('FLHS', ['FLHS'], 1977, 1977, 74, null, { notes: ['Classic Brown and other colors'] }),
  m('FLHS 80', ['FLHS'], 1980, 1983, 80, 4, { notes: ['stripped-down FLH 80', '1981 no kick starter, forward controls', '1982-83 FX-style seat and pull-back handlebars'] }),
  m('FLH 80', ['FLH'], 1978, 1984, 80, 4, { half: true, notes: ['first 1340 cc (from 1978 1/2)', '1983-84 belt drive'] }),
  m('FLH 80 Classic', ['FLHC'], 1979, 1984, 80, 4, { notes: ['black wrinkle cases and inner primary', 'deluxe Tour-Pak'] }),
  m('FLT 80', ['FLT'], 1980, 1983, 80, 5, { notes: ['first rubber-mounted 1340', 'first 5-speed transmission', 'enclosed rear chain', 'frame-mounted fairing, dual headlights'] }),
  m('FLT 80 Classic', ['FLTC'], 1982, 1982, 80, 5, { notes: ['see FLH 80 Classic'] }),
  m('FLHT and FLHT Classic', ['FLHT', 'FLHTC'], 1983, 1984, 80, 5, { notes: ['rubber-mounted, single headlight', 'chain drive'] }),
  m('FLH 80 Heritage', [], 1981, 1981, 80, 4, { notes: ['olive drab and orange paint', 'black engine, leather saddlebags'] }),
  m('FLHF', ['FLHF'], 1982, 1983, 80, null, { notes: ['FL-style foot controls with footboards'] }),
  m('FX', ['FX'], 1971, 1977, 74, 4, { notes: ['original Super Glide, kick start only', 'molded "boat-tail" rear fender', '1971-72 split tank, 1973 single tank',
    '1971-73 FL transmission (upside-down shift: 1 down, 3 up); 1974 FX transmission (1 up, 3 down)', '1976 Liberty Edition paint and trim',
    'passenger pegs moved from swingarm to frame', 'black cast wheel available'] }),
  m('FXE', ['FXE'], 1974, 1980, 74, 4, { notes: ['Super Glide, electric start', '1976 Liberty Edition paint and trim', '1977 on black cast wheel available', '1980 no kick starter'] }),
  m('FXE 80', ['FXE'], 1981, 1984, 80, null, {}),
  m('FXEF', ['FXEF'], 1978, 1980, 74, 4, { notes: ['Super Glide, electric start', 'split Fat Bob tanks'] }),
  m('FXEF 80', ['FXEF'], 1980, 1983, 80, 4, { notes: ['no kick starter'] }),
  m('FXS', ['FXS'], 1977, 1979, 74, 4, { notes: ['original Low Rider (to 1979 1/2), 27 in seat height', 'fork tubes 2 in longer', 'original paint metallic silver and black', 'black cases, metallic silver covers'] }),
  m('FXS 80', ['FXS'], 1979, 1982, 80, null, { half: true, notes: ['from 1979 1/2'] }),
  m('FXB 80 Sturgis', ['FXB'], 1980, 1982, 80, 4, { notes: ['dual belt drive'] }),
  m('FXSB', ['FXSB'], 1983, 1984, 80, 4, { notes: ['Low Rider, 2 in over fork tubes', '1983 double belt, 1984 single belt', 'buckhorn handlebars'] }),
  m('FXWG 80', ['FXWG'], 1980, 1984, 80, 4, { notes: ['Wide Glide front end', 'forward foot controls', 'first bobbed rear fender'] }),
  m('FXR', ['FXR'], 1982, 1983, 80, 5, { notes: ['first rubber-mounted FX', 'cast wheels', 'electric start and kick starter'] }),
  m('FXRS', ['FXRS'], 1982, 1983, 80, 5, { notes: ['rubber mount', 'isolated exhaust', 'new remote-reservoir brake master cylinder', 'Girling rear brake caliper', 'no kick starter'] }),
  m('FXRT', ['FXRT'], 1983, 1983, 80, 5, { notes: ['rubber mount, frame-mounted fairing, hard bags', 'anti-dive front and air-assisted rear suspension',
    'all-tubular welded frame', 'isolated foot pegs and exhaust', 'no kick starter'] }),
  m('FXDG Disc Glide', ['FXDG'], 1983, 1983, 80, 4, { notes: ['dual belt (like the Sturgis)', '1919 H-D tank decal, burgundy paint', 'metal primary and gear covers',
    'black engine and exhaust', 'disc center-line spun aluminum rear wheel', 'drilled brake discs front and rear', 'stainless braided oil line covers',
    'Wide Glide front end, bobbed rear fender'] }),
];

// PDF 14 footer of the model history: 1984 = last Shovelhead Electra Glide (collector edition).
export const FOOTNOTES = ['1984 collector edition celebrated the last Shovelhead Electra Glide (high trim and graphics)'];
