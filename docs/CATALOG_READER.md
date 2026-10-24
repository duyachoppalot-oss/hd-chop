# Parts-catalog reader (OCR) — dry run results

Reads Laken's H-D parts-catalog PDFs (`~/Desktop/Stanky/parts-catalogs`), OCRs every page, parses the part rows and reports what they would add. **Nothing is loaded**; there is no `--apply` yet.

## Pieces

| File | Does |
|---|---|
| `scripts/catalog/books.mjs` | Book list: file, years, row layout, model-code cleanup, codes each book declares |
| `scripts/catalog/ocr.mjs` | pdftoppm 300 dpi → tesseract (psm 6) → `~/Developer/catalog-ocr/<book>/pNNN.txt` + `.tsv` (word boxes). Cached; `--force` redoes. ~1 s/page on 7 cores |
| `scripts/catalog/parse.mjs` | Three layouts: `hd` (1971–86 books: index, part, name, "84 to * - FXST; 85 to * - FXWG"), `hd1950` (part, name, price–years, code word; "-Solo", "-Servi-Cars", "-45 model WLA & WLC"), `wla` (quantity columns 40/41/42 WLA, read by word position) |
| `scripts/etl/11_catalog_books.mjs` | Dry run: checks rows against hdchop vehicles/parts/fitment and what Stinkin' extracted from the same book. Writes `reports/11_catalog_books_<ts>.txt`, `11_catalog_rows_<book>_<ts>.csv`, `11_catalog_missing_vehicles_<ts>.csv` |

```bash
node scripts/catalog/ocr.mjs 1984-86-fxr
node scripts/etl/11_catalog_books.mjs
```

## Safety rules in the parser (row → review, never guessed)

- Part numbers: OCR repairs (lost dash `3307880`→`33078-80`, `A` read as `4` `2484-414`→`2484-41A`) are accepted only when the repaired number is already known (hdchop or Stinkin'); otherwise review.
- 1950 book: a 3-digit base not starting with 0 = first digit cut off by the scan edge (`485-12` is really `2485-12`) → review.
- 1942 WLA: the "♦" marker reads as a leading 4/9 (`41574-30`) → review when the 4-digit number is also in the book. Unreadable quantity cells are not claimed either way; only years read as ≥1 are claimed.
- Years: garbled (`19382`, `3941`, `1980` in a 1950 book) or outside the book → review. `84 & 86` = two years, not a range.
- Model codes: `-80` (80 cu in) and its OCR variants collapse to the base code; `P` read for `F` (`PXRS`) fixed; any code we have in no year and the book doesn't declare (`FAST`, `PREF`, `FXAT`) → review.
- "All Models" = the codes the book names for that year (+ our vehicles with those codes that year).
- 1950 Servi-Car section = PDF pages 82–92; pages 81 and 93 are mixed → rows there need an explicit qualifier.

## Results (2026-10-24, `reports/11_catalog_books_20261024_143527.txt`)

| Book | Rows | Clean | Part numbers (clean) | New to hdchop | Fitment pairs on existing bikes (new) | Note |
|---|---|---|---|---|---|---|
| 1984–86 FX-FXST | 2,721 | 92% | 1,899 | 343 | 12,103 (10,931 new) | Stinkin' had 1,034 numbers from it; fixes the thin 1985–86 FXWG/FXSB/FXEF |
| 1984–86 FXR | 2,855 | 91% | 1,910 | 267 | 16,756 (7,822 new) | `FXAT/FXRAT/FXAD/FXRAD` codes unknown → review |
| 1941–84 FL | 5,323 | 63% | 2,686 | 1,492 | 1,872 | "Classic" = FLHC 1979–84; FL/FLH/EL/FLHC bikes before 1984 don't exist in hdchop yet |
| 1950 45 cu in | 2,428 | 56% | 1,170 | 1,161 | 19,580 (WL, G only) | W, WLD, WLDR, GA, GD, GDT, WLA, WLC bikes don't exist yet |
| 1942 WLA | 1,216 | 79% | 913 | 900 | 0 | WLA bike doesn't exist yet |
| 1954–78 XLH/XLCH (Downloads) | 3,888 | 82% | 2,475 | 1,079 | 42,493 (21,457 new) | Ironhead. Exposed bad Sportster vehicles (below) |
| 1966–84 Shovelhead engine 99427-84 (Downloads) | 263 | 99% | 254 | 111 | 8,777 (6,287 new) | New `appl` layout (Description / Application / P/N by column). "Big Twins"/"Shovelhead"/"1340 models" = that year's Shovelhead big twins (fl, fx, fxr, touring; 1984 only bikes marked shovelhead). 1340/1200 kept as condition `80ci`/`74ci` |

Added 2026-10-24 from Laken's Google Drive (downloaded to ~/Downloads/hd-drive), with parser fixes (stray "=" / "—" before the name, wrapped-name used-on on the next line, "t0" for "to", "All Models." and "All Models except FXB & FXSB"); all books re-run, none got worse (`reports/11_catalog_books_20261024_174518.txt`):

| Book | Rows | Clean | Fitment pairs on existing bikes (new) | Note |
|---|---|---|---|---|
| 1971–84 FX Models 99455-83C | 4,708 | 77% | 60,834 (38,617 new) | OCR code repairs (EXWG→FXWG, FXS8→FXSB, FX0G→FXDG) only when they land on a book code |
| 1961–76 FL/FLH/FX/FXE | 2,465 | 16% | 603 | Poor scan; FL/FLH bikes before 1984 don't exist yet anyway |
| 1970 XR/XLR | 712 | 58% | 393 (XR750 1970) | "XR" = the 1970 XR750; XLR has no bike |
| Sportster 1959–69 service manual 99484-69 | — | — | — | Not a parts list (layout `manual`, 11 skips it); spec page 1A-3 feeds 12_vehicle_specs |

After the fixes: FX-FXST 93%, FXR 93%, FL 67%, XL 83%.

Spot checks (sample rows in the report) match the page images: e.g. FX-FXST p32 `33396-39 LOCKWASHER, starter clutch | 84 & 85 - FXST; 85 to * - FXWG, FXSB`.

## Decisions needed before anything loads

1. ~~"Classic" in the FL book~~ **Decided 2026-10-24:** FLH Classic (book p2–3 VIN tables: 1979 Classic, 1980 Classic, 1981+ "FLH Classic" AD) = **FLHC, 1979–84 only**, platform `fl` (`books.mjs` yearCode). In code lists Classic drops out for years before 1979. FLHC 2018+ stays the Softail Heritage Classic. "CLE" (1980) and "FLH-80 Heritage" (1981) still unmapped.
2. **New vintage bikes**: the books name FL/FLH/EL, W/WL/WLA/WLC/WLD/WLDR, G/GA/GD/GDT years hdchop lacks (`11_catalog_missing_vehicles_*.csv`). Catalog text like "41 to * - FL, FLH" means "whichever existed that year" (FLH started 1955), so model-years need a second source (H-D model history / `hd_year_model_master`) before 01 creates them.
3. **`FXAT, FXRAT, FXAD, FXRAD`** in the FXR book: real sub-models or OCR? (Check a page image.)
4. ~~Load path~~ **Built 2026-10-24 (not applied):** `11 --apply` writes `source = 'catalog_ocr'` (migration 007): clean rows only, pairs no other source has, medium (low for early/late years), 80ci/74ci conditions from the Shovelhead engine book, new part numbers with a cleaned short name. 03 and 09 --apply clear catalog_ocr rows, so the order is 01 → 03 → 04 → 09 → 11 → 05 → 06 → 07 --max-hole 3 → 08. Dry run vs the proposed vintage bikes: 175,225 rows (74,729 on new bikes), 5,650 new part numbers (3,880 named).

JW Boon vendor catalogs (VL, WL, Panhead, Big Twin; text PDFs in ~/Downloads) are next, under the vendor-evidence rule (DATA_RIGHTS, pending).

## Found by the XL book: Sportster vehicles are wrong (not changed)

hdchop has `XL` "Sportster" for every year 1957–85 but `XLH` only for 1976, 1978, 1984, 1985, and `XLS` only 1984–85. H-D's models were XL (1957), XLH and XLCH (1958 on), XLS Roadster (1979 on). The catalogs say "58 to * - XLH, XLCH", so XLH 1958–75, 1977, 1979–83 have no bike to attach to, and the generic `XL` rows are why Ironhead Sportsters show 0 parts after 1978.

**Dry-run fix (2026-10-24, not applied):** the book's "XL" after 1957 is the XLH (1977–78 rows say "XL, XLCH" and "XLH, XLCH" for the same kinds of parts). `01_vehicles` (XL_BOOK) adds XLH 1958–75 + 1977 and retires XL 1958–85; `lib/fitment.mjs` and `books.mjs` map the book's XL 1958–78 to XLH. 01 diff: +19 / ~0 / −28 (7,557 fitment rows, re-targeted to XLH by 03). 03 preview: each new XLH year gets 445–661 rows. This book's pairs go from 42,493 to 64,063 (49,903 new). XLH 1979–83 and XLS 1979–82 still need the 1979–85 Sportster catalog. `11_catalog_books --vehicles-from reports/01_vehicles_<ts>.json` previews against 01's proposal.

Also: `FLH-80`/`FXE-80` etc. collapse to the base code. For 1978–80, when 74 and 80 cu in were both sold, that loses an engine-size condition; the Shovelhead engine book now records it (`cond:80ci`/`74ci`), the other books don't yet.
