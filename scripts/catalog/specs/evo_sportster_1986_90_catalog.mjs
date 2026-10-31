// H-D 1986-90 XLH Evolution Sportster Parts Catalog (book 1986-90-xlh in
// scripts/catalog/books.mjs), General Information, PDF page 2. Transcribed from the
// page image.
//
// Printed VIN table: Engine Displacement "M - XLH 883cc, N - XLH 1100cc, P - XLH
// 1200cc"; models by year: 1986 XLH 883cc, XLH 883cc Deluxe, XLH 1100cc; 1987 XLH
// 883cc, XLH 883cc Deluxe, XLH 1100cc, XLH 883cc Hugger; 1988 to 1990 XLH 883cc,
// XLH 1200cc, XLH 883cc Hugger, XLH 883cc Deluxe. Transmission not stated (the gear
// lists name 2nd and 3rd gears only), so speeds stay empty.
//
// ci: 883 cc = 53.9 ci as 99484-69 prints it; 1100 and 1200 cc converted (cc / 16.387,
// one decimal). Our 1990 bare "XLH" isn't in the table: left empty.

export const SOURCE = {
  key: '1986-90-xlh:general-info',
  title: '1986-90 XLH Evolution Sportster Parts Catalog, General Information (VIN)',
  pages: 'PDF 2',
  coverageOnly: true,
};

export const ROWS = [
  { label: 'XLH 883cc', code: 'XLH883', from: 1986, to: 1990, ci: 53.9, speeds: null, note: '883 cc Evolution' },
  { label: 'XLH 883cc Deluxe', code: 'XLH883DLX', from: 1986, to: 1990, ci: 53.9, speeds: null, note: '883 cc Evolution' },
  { label: 'XLH 883cc Hugger', code: 'XLH883HUG', from: 1987, to: 1990, ci: 53.9, speeds: null, note: '883 cc Evolution' },
  { label: 'XLH 1100cc', code: 'XLH1100', from: 1986, to: 1987, ci: 67.1, speeds: null, note: '1100 cc Evolution' },
  { label: 'XLH 1200cc', code: 'XLH1200', from: 1988, to: 1990, ci: 73.2, speeds: null, note: '1200 cc Evolution' },
];

export const CC = { 53.9: 883, 67.1: 1100, 73.2: 1200 };
