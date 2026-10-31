// Front axle diameter and fork tube diameter from the V-Twin Mfg catalog
// (~/Desktop/Stanky/CATALOGS/VTCatalog.pdf, 2025 edition; DATA_RIGHTS row "V-Twin Mfg
// catalog, stock-fit size facts", Laken 2026-10-25). Bare values only, re-expressed;
// no part numbers, text or tables carried over. Read from the page images.
//
// Pages used (only tables or sentences that state a size for a year range + model):
//   p68  Touring "Front Axle Kits and Hardware": Fits / Dia column.
//   p459 Big Twin "Chrome Front Axle Kit": Year/Model / Outside Diameter column.
//   p62  Touring triple trees: "1984-96 FLT, FLHT, FLHR 41mm", "1997-13 ... 41mm", "2014-up FLT, 49mm".
//   p288 "41mm Fork Tube Set" / "35/39mm Fork Tubes" / "49mm Fork Tube Sets" headings with model-years.
//   p620 "Fork Seal" kits: MM / Year / Models table (its 1952-70 XL-XLH row starts at 1957 here: XL before 1957 is the K model).
//   p1019 "Flush Mount Axle fits 1988-99 XL models with 39 mm forks".
// Not used: p68 / p459 fork column (p68 prints 49 mm for 2008-up FLT, but p62 and p288 print
// 41 mm through 2013 and 49 mm from 2014; the dedicated fork tables win), p786 (column not
// labelled), rear axle pages (no diameter printed), rows hedged with "except sport package"
// (FXRS 1984-86) or early/late years ("1984-E86 XL" -> 1984-85; "Late 1986-87 XL" -> 1987).
//
// Row: [item, page, value, size_mm, 'FROM-TO TOKEN TOKEN ...']   ('up' = 2025, the edition)
// Tokens are vendor model tokens resolved by scripts/etl/lib/vendorterms.mjs (FLT, FXST,
// FLST, FXD, FXR, XL, FX, FLH = families by year; other codes exact). -CODE = except.
// Where a model token and a family token both cover a bike, the model row wins.

export const SOURCE = {
  key: 'vtwin-catalog-2025',
  title: 'V-Twin Mfg catalog (2025), stock-fit size facts',
  rank: 2,
  upTo: 2025,
};

const IN34 = ['3/4 in', 19.05];
const IN1 = ['1 in', 25.4];
const MM25 = ['25 mm', 25];

export const ROWS = [
  // ---- front axle ----
  ['axle_front', 68, ...IN34, '1984-99 FLT'],
  ['axle_front', 68, ...IN1, '2000-07 FLT'],
  ['axle_front', 68, ...MM25, '2008-up FLT'],
  ['axle_front', 459, ...IN34, '1980-83 FXWG'],
  ['axle_front', 459, ...IN34, '1984-06 FXST'],
  ['axle_front', 459, ...MM25, '2007-17 FXST'],
  ['axle_front', 459, ...MM25, '2008-17 FXDWG'],
  ['axle_front', 459, ...IN1, '2006-07 FXDWG'],
  ['axle_front', 459, ...IN34, '1984-86 FXE'],
  ['axle_front', 459, ...IN34, '1984-87 FXR FXRS'],
  ['axle_front', 459, ...IN34, '1988-99 FXR FXD'],
  ['axle_front', 459, ...IN34, '2000-03 FXD'],
  ['axle_front', 459, ...IN1, '2004-05 FXD'],
  ['axle_front', 459, ...IN1, '2006-07 FXD'],
  ['axle_front', 459, ...MM25, '2008-17 FXD'],
  ['axle_front', 459, ...IN34, '1988-96 FXSTS'],
  ['axle_front', 459, ...IN34, '2000-up FXSTS'],
  ['axle_front', 459, ...IN34, '1987-95 FLST FLSTF'],
  ['axle_front', 459, ...IN34, '1996-99 FLSTF FLST'],
  ['axle_front', 459, ...IN34, '2000-06 FLST FLSTF'],
  ['axle_front', 459, ...MM25, '2007-17 FLST'],
  ['axle_front', 459, ...IN34, '1997-06 FLSTS'],
  ['axle_front', 459, ...MM25, '2007-17 FXSTD'],
  ['axle_front', 459, ...IN34, '2000-06 FXSTD'],

  // ---- fork tube ----
  ['fork_tube', 62, '41 mm', 41, '1984-96 FLT FLHT FLHR'],
  ['fork_tube', 62, '41 mm', 41, '1997-13 FLT FLHT FLHR'],
  ['fork_tube', 62, '49 mm', 49, '2014-up FLT'],
  ['fork_tube', 288, '41 mm', 41, '2000-17 FXST FLST'],
  ['fork_tube', 288, '41 mm', 41, '2000-05 FXDWG'],
  ['fork_tube', 288, '41 mm', 41, '1984-99 FXST FXSTC'],
  ['fork_tube', 288, '41 mm', 41, '1986-99 FLST FLSTF FLSTN'],
  ['fork_tube', 288, '41 mm', 41, '1993-99 FXDWG'],
  ['fork_tube', 288, '41 mm', 41, '1985-86 FXWG'],
  ['fork_tube', 288, '35 mm', 35, '1984-85 XL'],
  ['fork_tube', 288, '35 mm', 35, '1984-85 FXE FXEF'],
  ['fork_tube', 288, '35 mm', 35, '1984-86 FXR FXRDG FXRC -FXRS -FXRT -FXRD -FXLR -FXRP'],
  ['fork_tube', 288, '35 mm', 35, '1983-86 FXRT FXRD'],
  ['fork_tube', 288, '35 mm', 35, '1984-85 FXSB'],
  ['fork_tube', 288, '35 mm', 35, '1987-87 XL'],
  ['fork_tube', 288, '35 mm', 35, '1987-87 FXR FXRS -FXRT -FXRD -FXLR -FXRP -FXRS-SP'],
  ['fork_tube', 288, '39 mm', 39, '1988-94 FXRT'],
  ['fork_tube', 288, '39 mm', 39, '1987-94 FXRS-SP'],
  ['fork_tube', 288, '39 mm', 39, '1987-94 FXLR'],
  ['fork_tube', 288, '39 mm', 39, '1988-94 FXR FXRS'],
  ['fork_tube', 288, '39 mm', 39, '1991-05 FXD FXDL'],
  ['fork_tube', 288, '49 mm', 49, '2006-17 FXD -FXDF'],
  ['fork_tube', 288, '49 mm', 49, '2008-17 FXDF'],
  ['fork_tube', 288, '49 mm', 49, '2014-17 FLT'],
  ['fork_tube', 620, '41 mm', 41, '1948-76 FLH'],
  ['fork_tube', 620, '41 mm', 41, '1977-84 FLH FLT FXWG'],
  ['fork_tube', 620, '33.4 mm', 33.4, '1957-70 XL XLH'],
  ['fork_tube', 620, '33.4 mm', 33.4, '1971-72 FX'],
  ['fork_tube', 620, '35 mm', 35, '1973-77 FX'],
  ['fork_tube', 620, '35 mm', 35, '1976-83 FX FXR'],
  ['fork_tube', 1019, '39 mm', 39, '1988-99 XL'],
];
