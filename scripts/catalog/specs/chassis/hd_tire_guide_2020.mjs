// H-D "2020 Tire Fitment Guide: Original Equipment and Recommended Replacement
// Tires" (August 2019; ~/Downloads/hd-drive/OE_and_Recommended_Replacement_Tires.pdf).
// Transcribed from the page images: only rows whose fitment column says Stock
// ("Stock", "(BW) Stock", "Stock '04-'10", "Stock on MY '11-later"); Optional rows and
// accessory-wheel rows are left out. Each row gives the tire size and the rim size
// ("2.15 x 19" = 2.15 in wide, 19 in diameter) for the front or rear wheel.
//
// Row: [position, page, rim 'W x D', tire, stock years or null, ...model specs]
// Model spec: "FROM-TO CODE CODE ..." with two-digit years as printed ('later' = 2020,
// the guide's model year). Tokens:
//   CODE        that model code (also matches its fuel-injected twin CODE+'I': FLSTC -> FLSTCI)
//   @platform   every model of our platform in those years ("Dyna models", "'03-'05 Softail")
//   @XL         every Sportster code starting XL ("'04-later XL (except ...)")
//   -CODE       except that code;  -CODE:YY-YY  except that code in those years
// Stock years ("Stock '91-'09" printed in the fitment column) narrow the model years.
// Where the printed models name a group we don't carry (CLE/RLE/TLE sidecar rigs,
// LiveWire), the row is left out.

export const SOURCE = {
  key: 'hd-tire-guide-2020',
  title: 'H-D 2020 Tire Fitment Guide (OE and Recommended Replacement Tires, Aug 2019)',
  rank: 1,
};

export const ROWS = [
  // ---- Sportster, p4 ----
  ['front', 4, '2.15 x 19', '100/90-19', null, '96-03 XL1200S'],
  ['front', 4, '3.00 x 19', '120/70R19', null, '16-20 XL1200CX'],
  ['front', 4, '3.00 x 16', 'MT90B16', '10-10', '10-20 XL1200X', '18-20 XL1200XS'],
  ['front', 4, '3.50 x 18', '120/70ZR18', '08-11', '08-13 XR1200 XR1200X'],
  ['front', 4, '2.15 x 19', '100/90-19', '04-10', '04-20 @XL -XL883C -XL1200C -XL1200CX -XL1200NS -XL1200T -XL1200X -XL1200XS -XL1200V -XL883L:2011-2020'],
  ['front', 4, '2.15 x 19', '100/90-19', null, '91-09 XL883 XL883R XL883HUG', '88-03 XL1200 XLH1200', '83-84 XR1000'],
  ['front', 4, '2.15 x 21', 'MH90-21', null, '96-10 XL883C XL1200C'],
  ['front', 4, '2.15 x 21', 'MH90-21', null, '12-16 XL1200V'],
  ['front', 4, '3.00 x 16', '130/90B16', '11-20', '11-20 XL1200C', '10-20 XL1200X', '18-20 XL1200XS'],
  ['front', 4, '3.50 x 18', '120/70ZR18', null, '11-20 XL883L'],
  ['front', 4, '3.50 x 18', '120/70ZR18', '12-13', '08-13 XR1200 XR1200X'],
  ['front', 4, '3.50 x 18', '120/70ZR18', null, '14-17 XL1200T'],
  ['front', 4, '2.15 x 19', '100/90B19', '11-20', '04-20 @XL -XL883C -XL1200C -XL1200CX -XL1200T -XL1200X -XL1200XS -XL1200V -XL883L:2011-2020'],
  ['rear', 4, '3.00 x 16', '130/90B16', null, '96-03 XL1200S'],
  ['rear', 4, '4.25 x 18', '150/70R18', null, '16-20 XL1200CX'],
  ['rear', 4, '3.00 x 16', '150/80B16', '04-10', '04-20 @XL -XL1200CX -XL1200X -XL1200XS -XL1200V -XL1200T -XL883L:2011-2020 -XL1200C:2011-2020'],
  ['rear', 4, '3.00 x 16', '150/80B16', null, '12-20 XL1200V'],
  ['rear', 4, '3.00 x 16', '130/90B16', null, '81-03 @XL -XL1200S'],
  ['rear', 4, '5.50 x 17', '180/55ZR17', '08-11', '08-13 XR1200 XR1200X'],
  ['rear', 4, '3.00 x 16', '150/80B16', '11-20', '04-20 @XL -XL1200CX -XL1200T -XL883L:2011-2020 -XL1200V'],
  ['rear', 4, '4.50 x 17', '150/60ZR17', null, '11-20 XL883L'],
  ['rear', 4, '4.50 x 17', '150/70ZR17', null, '14-17 XL1200T'],
  ['rear', 4, '5.50 x 17', '180/55ZR17', '12-13', '08-13 XR1200 XR1200X'],

  // ---- VRSC, p5 ----
  ['front', 5, '3.00 x 19', '120/70ZR19', '02-10', '02-17 @v_rod'],
  ['front', 5, '3.00 x 19', '120/70ZR19', '11-17', '09-17 VRSCF', '07-17 VRSCDX'],
  ['rear', 5, '8.00 x 18', '240/40R18', null, '07-10 VRSCAW', '06-06 VRSCSE2', '07-07 VRSCX'],
  ['rear', 5, '8.00 x 18', '240/40R18', '07-10', '07-17 VRSCDX', '09-17 VRSCF'],
  ['rear', 5, '5.50 x 18', '180/55ZR18', null, '02-08 @v_rod -VRSCSE2:2006-2006 -VRSCAW -VRSCDX -VRSCX -VRSCF'],
  ['rear', 5, '8.00 x 18', '240/40R18', '11-17', '09-17 VRSCF', '07-17 VRSCDX'],

  // ---- Dyna / FXR, p6 ----
  ['front', 6, '2.15 x 19', '100/90-19', null, '00-01 FXDX'],
  ['front', 6, '2.15 x 21', '80/90-21', '10-11', '93-17 FXDWG'],
  ['front', 6, '3.00 x 16', '130/90B16', null, '08-17 FXDF', '09-10 FXDFSE FXDFSE2'],
  ['front', 6, '3.50 x 18', '130/70B18', null, '12-16 FLD'],
  ['front', 6, '2.15 x 19', '100/90-19', '91-09', '91-17 @dyna -FLD -FXDF -FXDFSE -FXDFSE2 -FXDSE -FXDSE2 -FXDWG -FXDWG2 -FXDWG3'],
  ['front', 6, '2.15 x 19', '100/90-19', null, '84-94 @fxr -FXLR -FXR2', '83-92 FXRT'],
  ['front', 6, '2.15 x 21', 'MH90-21', null, '93-08 FXDWG FXDWG2 FXDWG3', '81-86 FXWG', '87-94 FXLR', '99-99 FXR2', '07-08 FXDSE FXDSE2'],
  ['front', 6, '2.15 x 19', '100/90-19', '10-17', '06-17 @dyna -FLD -FXDF -FXDFSE -FXDFSE2 -FXDWG'],
  ['front', 6, '2.15 x 21', '80/90-21', '12-17', '10-17 FXDWG'],
  ['rear', 6, '3.00 x 16', '150/80B16', null, '00-01 FXDX'],
  ['rear', 6, '4.50 x 17', '180/60B17', '10-11', '10-17 FXDWG'],
  ['rear', 6, '3.00 x 16', '130/90B16', null, '82-00 @fxr', '82-92 FXRT', '91-01 @dyna -FXDX:2000-2001'],
  ['rear', 6, '3.00 x 16', '150/80B16', null, '02-05 @dyna'],
  ['rear', 6, '5.00 x 16', '180/70B16', null, '08-17 FXDF', '09-10 FXDFSE FXDFSE2'],
  ['rear', 6, '4.50 x 17', '170/60R17', null, '07-08 FXDSE FXDSE2'],
  ['rear', 6, '4.50 x 17', '160/70B17', '06-09', '06-17 @dyna -FLD -FXDF -FXDFSE -FXDFSE2 -FXDSE -FXDSE2 -FXDWG:2010-2017'],
  ['rear', 6, '4.50 x 17', '160/70B17', null, '12-16 FLD'],
  ['rear', 6, '4.50 x 17', '160/70B17', '10-17', '06-17 @dyna -FLD -FXDF -FXDFSE -FXDFSE2 -FXDSE -FXDSE2 -FXDWG:2010-2017'],
  ['rear', 6, '4.50 x 17', '180/60B17', '12-17', '10-17 FXDWG'],

  // ---- Softail front, p7-8 ----
  ['front', 7, '3.00 x 16', 'MT90B16', null, '18-20 FLDE'],
  ['front', 7, '3.00 x 16', '130/90B16', null, '18-20 FLHC FLHCS FLSL'],
  ['front', 7, '2.50 x 19', '110/90B19', null, '18-20 FXBB'],
  ['front', 7, '3.00 x 16', '150/80B16', null, '18-20 FXFB FXFBS'],
  ['front', 7, '3.00 x 16', 'MT90B16', null, '87-17 FLSTC', '97-03 FLSTS', '93-17 FLSTN', '86-10 FLST', '90-06 FLSTF', '05-07 FLSTSC', '08-11 FLSTSB'],
  ['front', 7, '3.00 x 16', 'MT90B16', null, '14-15 FLSTNSE', '05-05 FLSTFSE', '12-17 FLS', '16-17 FLSS'],
  ['front', 7, '3.50 x 17', '140/75R17', null, '07-17 FLSTF', '10-17 FLSTFB', '16-17 FLSTFBS', '06-06 FLSTFSE FLSTFSE2'],
  ['front', 7, '3.50 x 18', '130/70R18', null, '10-12 FLSTSE FLSTSE2 FLSTSE3', '08-09 FXSTSSE FXSTSSE2 FXSTSSE3'],
  ['front', 7, '2.15 x 19', '90/90-19', null, '08-09 FXCW', '08-11 FXCWC'],
  ['front', 7, '2.15 x 21', 'MH90-21', null, '84-07 FXST', '99-07 FXSTB', '86-07 FXSTC', '00-07 FXSTD', '03-04 FXSTDSE FXSTDSE2', '88-06 FXSTS', '07-07 FXSTSSE', '11-13 FXS'],
  ['front', 7, '2.15 x 21', 'MH90-21', null, '08-15 FXST', '08-09 FXSTB', '08-10 FXSTC'],
  ['front', 7, '3.50 x 21', '130/60B21', null, '13-17 FXSB FXSBSE'],
  ['front', 7, '3.50 x 19', '130/60B19', null, '16-17 FXSE'],
  ['front', 8, '4.50 x 18', '160/60R18', null, '18-20 FLFB FLFBS FLFBSANV'],
  ['front', 8, '3.50 x 21', '130/60B21', null, '18-20 FXBR FXBRS'],
  ['front', 8, '2.50 x 19', '110/90B19', null, '18-20 FXLR', '20-20 FXLRS'],
  ['front', 8, '3.50 x 18', '130/70B18', null, '18-20 FLSB'],
  ['front', 8, '3.00 x 19', '120/70ZR19', null, '19-20 FXDRS'],

  // ---- Softail rear, p9-10 ----
  ['rear', 9, '4.50 x 17', '180/60B17', null, '04-04 FXSTDSE FXSTDSE2'],
  ['rear', 9, '3.00 x 16', 'MU85B16', null, '18-20 FLDE'],
  ['rear', 9, '3.00 x 16', '150/80B16', null, '18-20 FLHC FLHCS FLSL'],
  ['rear', 9, '3.00 x 16', '150/80B16', null, '18-20 FXBB'],
  ['rear', 9, '5.00 x 16', '180/70B16', null, '18-20 FXFB FXFBS'],
  ['rear', 9, '3.00 x 16', 'MT90B16', null, '87-02 FLSTC', '90-02 FLSTF', '97-02 FLSTS', '93-93 FLSTN', '86-90 FLST', '99-02 FXST', '95-97 FXSTSB', '95-99 FXSTC', '95-02 FXSTS'],
  ['rear', 9, '3.00 x 16', 'MT90B16', null, '99-02 FXSTB'],
  ['rear', 9, '3.00 x 16', 'MU85B16', null, '14-15 FLSTNSE', '05-17 FLSTN', '03-03 FLSTS', '11-13 FXS', '12-17 FLS', '16-17 FLSS'],
  ['rear', 9, '3.00 x 16', '130/90B16', null, '84-90 FXST', '84-94 FXSTC FXSTS'],
  ['rear', 9, '3.00 x 16', '150/80B16', null, '03-17 FLSTC'],
  ['rear', 9, '3.00 x 16', 'MU85B16', '09-17', '03-17 FLSTC'],
  ['rear', 9, '3.00 x 16', '150/80B16', null, '03-05 @softail -FXSTD -FLSTS', '03-06 FLSTF', '05-05 FLSTFSE', '05-07 FLSTSC', '06-10 FLST'],
  ['rear', 9, '4.50 x 17', '160/70B17', null, '00-07 FXSTD -FXSTDSE:2004-2004', '03-03 FXSTDSE'],
  ['rear', 9, '6.00 x 17', '200/55R17', null, '07-17 FLSTF', '10-17 FLSTFB', '16-17 FLSTFBS', '06-06 FLSTFSE FLSTFSE2', '06-15 FXST', '06-09 FXSTB', '06-10 FXSTC', '06-06 FXSTS', '07-08 FXSTSSE FXSTSSE2'],
  ['rear', 9, '6.00 x 17', '200/55R17', null, '08-11 FLSTSB'],
  ['rear', 9, '6.00 x 18', '200/50R18', null, '10-12 FLSTSE FLSTSE2 FLSTSE3', '16-17 FXSE'],
  ['rear', 9, '8.00 x 18', '240/40R18', null, '08-09 FXCW', '08-11 FXCWC', '13-17 FXSB FXSBSE', '16-17 FXSE', '09-09 FXSTSSE FXSTSSE3'],
  ['rear', 10, '8.00 x 18', '240/40R18', null, '18-20 FLFB FLFBS FLFBSANV FXBR FXBRS', '19-20 FXDRS'],
  ['rear', 10, '5.00 x 16', '180/70B16', null, '18-20 FXLR FLSB', '20-20 FXLRS'],

  // ---- Touring front, p11 ----
  ['front', 11, '3.50 x 21', '130/60B21', null, '18-20 FLTRXSE'],
  ['front', 11, '3.00 x 16', 'MT90B16', null, '14-20 FLHRC'],
  ['front', 11, '3.00 x 16', 'MT90B16', null, '05-05 FLHTCSE FLHTCSE2', '06-08 FLHTCUSE FLHTCUSE2 FLHTCUSE3'],
  ['front', 11, '3.00 x 16', '130/90B16', null, '09-13 FLHRC'],
  ['front', 11, '3.00 x 16', 'MT90B16', null, '98-08 FLTR', '98-08 FLHRC', '94-08 FLHR -FLHRSE:2007-2008', '84-08 FLHX', '83-08 FLHTC FLHTCU', '83-08 FLHT', '81-96 FLT FLTC FLTCU'],
  ['front', 11, '3.00 x 17', '130/80B17', null, '16-20 FLTRU', '16-16 FLTRUSE', '14-19 FLHR', '14-19 FLHTCU', '14-19 FLHTK FLHTKSE', '14-20 FLHP', '14-20 FLHTP', '09-13 FLHP FLHTP'],
  ['front', 11, '3.00 x 17', '130/80B17', null, '09-13 FLHR', '09-10 FLHT', '09-13 FLHTC FLHTCU', '09-13 FLHTCUSE FLHTCUSE4 FLHTCUSE5 FLHTCUSE6 FLHTCUSE7 FLHTCUSE8', '10-13 FLHTK', '09-09 FLHX FLTR', '11-13 FLTRU'],
  ['front', 11, '3.50 x 18', '130/70R18', null, '07-08 FLHRSE FLHRSE3 FLHRSE4'],
  ['front', 11, '3.50 x 18', '130/70B18', null, '10-13 FLHX FLTRX', '10-10 FLHXSE', '09-09 FLTRSE', '11-11 FLTRUSE', '20-20 FLHR FLHTK FLTRK'],
  ['front', 11, '3.50 x 19', '130/60B19', null, '17-20 FLHRXS', '14-20 FLHX FLHXS', '15-20 FLTRX FLTRXS', '13-14 FLHRSE', '12-13 FLTRXSE FLTRXSE2', '18-20 FLTRXSE', '11-20 FLHXSE FLHXSE2 FLHXSE3', '20-20 FLHTKSE'],

  // ---- Touring rear, p12 ----
  ['rear', 12, '5.00 x 16', '180/65B16', null, '14-19 @touring -FLHRC -FLHRSE -FLHXSE', '14-17 FLHXS', '15-17 FLTRXS', '20-20 FLHP FLHTP FLHT'],
  ['rear', 12, '5.00 x 16', '180/65B16', null, '09-13 FLHP FLHTP', '09-20 FLHRC'],
  ['rear', 12, '5.00 x 16', '180/65B16', null, '09-13 FLHTC FLHTCU FLHR', '09-10 FLHT', '09-13 FLHTCUSE FLHTCUSE4 FLHTCUSE5 FLHTCUSE6 FLHTCUSE7 FLHTCUSE8', '10-13 FLHTK', '09-13 FLHX FLTR FLTRU', '10-13 FLTRX'],
  ['rear', 12, '3.00 x 16', 'MU85B16', null, '04-05 FLHTCSE FLHTCSE2', '06-08 FLHTCUSE FLHTCUSE2 FLHTCUSE3', '04-08 FLHX'],
  ['rear', 12, '3.00 x 16', 'MU85B16', null, '04-08 FLHR -FLHRSE:2007-2008', '04-08 FLHRC FLHT FLHTC FLHTCU FLTR'],
  ['rear', 12, '3.00 x 16', 'MT90B16', null, '81-84 FLH', '94-03 FLHR', '98-03 FLHRC', '81-93 FLHS', '83-03 FLHT', '83-03 FLHTC FLHTCU', '81-85 FLT', '98-03 FLTR'],
  ['rear', 12, '4.50 x 17', '170/60R17', null, '07-08 FLHRSE FLHRSE3 FLHRSE4'],
  ['rear', 12, '5.00 x 18', '180/55B18', null, '17-20 FLHRXS', '18-20 FLHXS FLTRXS', '13-14 FLHRSE', '12-13 FLTRXSE FLTRXSE2', '18-20 FLTRXSE', '11-11 FLTRUSE', '10-20 FLHXSE FLHXSE2 FLHXSE3', '09-09 FLTRSE', '20-20 FLHR FLHX FLTRX FLHTK FLTRK FLHTKSE'],

  // ---- Trike, p13 ----
  ['front', 13, '3.00 x 16', 'MT90B16', null, '09-20 FLHTCUTG', '10-11 FLHXXX'],
  ['front', 13, '3.50 x 19', '130/60B19', null, '15-20 FLRT'],
  ['rear', 13, '7.00 x 18', 'P215/45R18', null, '20-20 FLHTCUTGSE'],
  ['rear', 13, '5.50 x 15', 'P205/65R15', null, '15-20 FLRT', '09-20 FLHTCUTG', '10-11 FLHXXX'],

  // ---- Street, p14 ----
  ['front', 14, '2.50 x 17', '100/80-17', null, '15-20 @street -XG750A'],
  ['front', 14, '3.50 x 17', '120/70R17', null, '17-20 XG750A'],
  ['rear', 14, '3.50 x 15', '140/75R15', null, '15-20 @street -XG750A'],
  ['rear', 14, '4.50 x 17', '160/60R17', null, '17-20 XG750A'],
];
