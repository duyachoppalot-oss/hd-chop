// H-D Sportster Service Manual 1959-1969 (99484-69), Section 1A "General -
// Specifications", printed page 1A-3 (revised 5-68), PDF page 9. Transcribed
// from the page image. The manual covers 1959-69, so rows are bounded to those
// years even where the model ran longer.
//
// Printed: Piston Displacement (883 c.c.) 53.9 cu. in.; Transmission Speeds 4
// Forward; Horsepower XL 42 HP at 5,500 R.P.M., XLCH, XLH 55 HP at 6,300 R.P.M.;
// Compression Ratio XL 7.5 to 1, XLCH, XLH 9.0 to 1.

export const SOURCE = {
  key: '99484-69:1A-3',
  title: 'Sportster Service Manual 1959-1969 (99484-69), Specifications',
  pages: 'PDF 9 (printed 1A-3, rev. 5-68)',
  // The manual's years bound the rows, not the models' production: skip the year check.
  coverageOnly: true,
};

export const ROWS = [
  { label: 'XLH', code: 'XLH', from: 1959, to: 1969, ci: 53.9, cc: 883, speeds: 4, hp: '55 hp @ 6,300 rpm', compression: '9.0:1', note: '' },
  { label: 'XLCH', code: 'XLCH', from: 1959, to: 1969, ci: 53.9, cc: 883, speeds: 4, hp: '55 hp @ 6,300 rpm', compression: '9.0:1', note: '' },
];
