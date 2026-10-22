# Phase 0 — Discovery findings

Run: 2026-10-22. Source: `stinkin_catalog` on Hetzner (PostgreSQL 15.17), role `hdchop_ro` (read-only; write attempt rejected).
Raw output: `reports/0*_20261022_*.txt` (git-ignored, regenerate with `scripts/discovery/`).

## Gate verdict: NOT PASSED as originally written → path chosen

Conditions partly survived extraction, but the bigger problem is row alignment. The table the docs assumed (`oem_fitment`) has part numbers, descriptions and models drifting apart. A cleaner table exists (`hd_oem_catalog_reference`) but has its own extractor defects.

## Decision (2026-10-22): assemble our own fitment from multiple sources

Laken chose to build `hdchop` as a merged layer instead of fixing the extractor first. Each field comes from the source that is most reliable for it, other sources corroborate or repair it, and every fitment row records its source and confidence. Ambiguous or conflicting rows go to a review report, never into the app. Plan: `docs/ETL_PLAN.md`.

Why it's viable: of 16,503 truncated (base, year) part numbers in the reference table, 13,884 (84%) have exactly one full-number candidate in the same year across `oem_fitment` + the reference table; 1,367 ambiguous, 230 unique in another year, 135 ambiguous in another year, 887 (5%) no candidate. Extractor fixes become optional follow-up for the remaining ~16%.

| Field | Primary | Corroborate / repair |
|---|---|---|
| Part number | `hd_oem_catalog_reference` | `oem_fitment` + reference full numbers repair truncated ones |
| Part name + fitted models | `hd_oem_catalog_reference` (`description`, `used_on_raw`) | `oem_fitment` same number + year raises confidence; its page-level models are not trusted |
| Carb vs EFI | `…I` model codes | Description text |
| Other conditions | Description + `used_on_raw` text | — |
| Vehicles | `harley_families` → `harley_models` → `harley_model_years` (the live picker: 3,199 year×model, incl. 30 `…I` codes) | `hd_year_model_master` (1,618; 1,518 overlap, 100 only there) |

## Where the data lives

| Need | Table | Rows | Notes |
|---|---|---|---|
| OEM fitment (assumed) | `oem_fitment` | 315,427 | 18,308 distinct part nos, 121 catalog PDFs, 1984–2026. **Misaligned** — see below |
| OEM fitment (better) | `hd_oem_catalog_reference` | 239,520 | 36,110 distinct part nos, 131 docs, mostly 1950–2026. Per-line `description` + `used_on_raw` |
| Vehicles | `hd_year_model_master` | 1,618 | year × model_code, 184 codes, 1930–2026. `platform` is only FL/FX/XL/RevMax/Other |
| Vehicles (alt) | `harley_models`, `harley_model_years`, `hd_models`, `hd_sportster_models`, `harley_families` | 356 / 3,306 / 309 / 26 / 17 | Not yet compared |
| Engines | `hd_engine_types`, `hd_family_engine_map`, `engine_platform_map` | 15 / 16 / 6 | engine_key with year ranges |
| Supersession | `oem_supersession` | 283 | All `source='inferred'`, all letter bumps (e.g. 16219-79A → 79B), no effective_year |
| Timeline | `oem_part_timeline` | **0** | Empty |
| Model aliases | `model_alias_map` | 347 | alias_text → model_family/model_code with priority |
| Specs | `bike_specs` | 1,225 | battery, plugs, belts, tires — no fuel_system/engine columns |

The docs' table list was right about names but not about which table is usable.

## `oem_fitment` defects (do not ETL as-is)

- **Description is often the figure heading, not the part.** e.g. `27067-96A` (turn signal) has description `FUEL TANK & TRIM`. 7,140 rows have description = section.
- **`section` holds the next parts-list line**, e.g. `16 11717 FASTENING GROMMET (2)`.
- **Model codes are mostly page-level, not per part:** 161,933 rows (51%) take models from a `(section)` heading; 101,211 per-line; 39,683 `ALL`; 12,600 empty (2021 Touring — models are stuck in the description text instead).
- **Junk codes:** 94,661 of 483,590 non-ALL code refs aren't in `hd_year_model_master`. Biggest: `FLT` 9,549, `FLYWHEELS` 7,715. Most of the rest are EFI `…I` codes (below), which are real.
- Year columns are catalog years (mostly single-year catalogs), not usage spans.

## `hd_oem_catalog_reference` defects

- **Truncated part numbers:** 21,959 rows / 4,851 numbers end in `-` with the year suffix lost (e.g. `61586-`). Concentrated 1990–2015 (2–5k per 5-yr bucket).
- Part number formats: 121,214 valid `NNNNN-YY[A]`; 87,005 dashless (hardware like `3275`, plus newer 8-digit); 9,342 other (`6400HB`, `99A`, `79399181352960018` — junk).
- **`category` is a sticky page heading:** 35,969 rows say `INTERNATIONAL MODELS ONLY` incl. ordinary engine-mount parts.
- **Bad years:** ~100 rows with year_start > 2026 (e.g. 9010, 11035); 182 null.
- Descriptions include quantity in-line (`SCREW (2)`); some are fragments (`2`, `1`, `Unkno`).
- `vehicle_model` = first model of `used_on_raw` only. Use `used_on_raw`.
- Overlap: 14,669 part numbers appear in both tables; reference has 31,256 non-truncated distinct numbers.

## Conditions — did they survive?

Counts across description + used_on (reference) and description + qty_note + models_raw (oem_fitment), excluding `CARBURETOR (x OF y)` headings:

| Tag | reference | oem_fitment | Verdict |
|---|---|---|---|
| california | 2,242 | 1,630 | Survived — "(California only)", "(49 state, California)" |
| hdi / international | 7,205 | 5,885 | Survived, but inflated by the sticky `INTERNATIONAL MODELS ONLY` heading |
| abs | 941 | 4,334 | Survived |
| non_abs | 456 | 3,149 | Survived ("NON-ABS") |
| carb | 548 | 1,469 | Sparse — mostly carb parts named "carburetor", not fitment qualifiers |
| efi | 259 | 1,400 | Sparse in text |
| cvo | 0 | 0 | Absent |
| cable/hydraulic clutch | 10 | 0 | Absent |
| cast/laced wheel | 1,632 | 177 | Present (reference) |

**Carb vs EFI is better signalled by model code than by text:** `oem_fitment` uses 26 distinct EFI `…I` codes (FLHRCI, FLTRI, FLSTCI…) across 57,536 refs. These codes are missing from `hd_year_model_master`. Use the `I` suffix → `fuel_system='efi'` instead of regex on descriptions.

## Data rights check

Both fitment tables are extracted from HD parts catalogs → covered by the `oem_fitment` row in DATA_RIGHTS.md (normalized number, year, model, our own short description, condition tags). `hd_oem_catalog_reference` needs adding to DATA_RIGHTS.md under the same rule.

The `hdchop_ro` role currently has SELECT on every table in `public`, including `orders`, `order_items`, `customer_points`, `user_garage`. Narrow the grants to the tables in "Where the data lives" before any ETL runs unattended.

## Extractor fixes needed (before Phase 1)

1. Keep the full part number (year suffix) — fixes 4,851 truncated numbers in the reference table.
2. Reset category/section at each figure, don't carry it across pages.
3. Per-line models: parse model codes from each part line, not the page heading (oem_fitment).
4. Reject year values outside 1903–2027.
5. Decide which extractor is canonical. Recommendation: `hd_oem_catalog_reference`, since its per-line structure is already right.

## Decisions for Laken

- ~~**Primary fitment source**~~ — decided 2026-10-22: assembled, reference table primary (see Decision above).
- **Supersession:** the 283 inferred A→B→C pairs conflict with the domain rule "letter suffixes at the same year = parallel options". Either drop them or confirm they're true revisions. Real supersession data (e.g. "use 63501-68B" notes — 40+ rows in `qty_note`, more in descriptions) could be mined instead.
- **Vehicle platform mapping:** `hd_year_model_master.platform` is FL/FX/XL; map to touring/softail/dyna/sportster with the FL/FX domain rule, and add EFI `…I` codes.
- **Seeds:** catalog wording confirmed for e.g. `FUEL TANK`, `FUEL TANK KIT (prime)`, `AIR CLEANER`, `SADDLEBAGS`, `HORN`, `HANDLEBAR`. Run the per-term match counts (ETL step 05) against the chosen table.
