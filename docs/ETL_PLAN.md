# Phase 1 — Merge ETL plan

Builds `hdchop` from several source tables (decision: DISCOVERY.md, 2026-10-22). Numbers below are from discovery; each script re-measures them in its dry-run report.

## Principles

- Field-level source of truth (table in DISCOVERY.md). Other sources only corroborate or repair.
- Every fitment row carries `source_ref` (source table + row id) and a `confidence`.
- Anything ambiguous, unresolvable or contradictory goes to `reports/<script>_review_<ts>.csv`, not into `hdchop`. The review files are the to-do list for extractor fixes.
- All rules from CLAUDE.md apply: SELECT-only on source, dry-run by default, `--apply` to write, report with counts + 20 samples, no invented numbers/years/fitment.

## Schema changes — `002_merge_provenance.sql` (written, tested in a rolled-back transaction)

| Table | Change | Why |
|---|---|---|
| `oem_parts` | `number_source text NOT NULL` (`extracted` \| `repaired_same_year` \| `repaired_other_year`) | Show/filter repaired numbers |
| `fitment` | `confidence text NOT NULL` (`high` \| `medium` \| `low`) | Two-source agreement vs one source vs repaired |
| `vehicles` | `platform` values lowercase (`touring`, `softail`, `dyna`, `sportster`, `fxr`, `trike`, `v_rod`, `street`, `revolution_max`, `vintage`) | Matches 001 comment; engine eras are not platforms |

`fitment_spans` filters to `confidence IN ('high','medium')` by default; `low` stays queryable for review. Also: `fitment.source_ref` NOT NULL; `cvo`/`cable_clutch`/`hydraulic_clutch` tags removed (step 04 item 3).

## Scripts (`scripts/etl/`)

### 01_vehicles.mjs — applied 2026-10-23 (1,671 rows)
Source: picker chain `harley_families → harley_models → harley_model_years` (3,199 year×model).
- **Evidence gate:** the picker pads years (FLT "Tour Glide" 1939–2026, XL 1936–52, FX 1941–2026). A row loads only if `hd_year_model_master`, `oem_fitment.model_codes` or a code token in reference `used_on_raw`/`vehicle_model` confirms that year. Catalog evidence counts only from single-year rows; bare `FL`/`FX`/`XL` tokens are family abbreviations and need the master.
- **Platform:** lowercase from family. Flathead/Knucklehead/Panhead/Shovelhead are engine eras → `vintage`, or platform from the other family when listed under both (engine from the era family). K series (Sportster family, `filter_group='VINTAGE'`) → vintage/flathead. FXLR under FXR + Softail before 2018 → `fxr`. Other conflicts → review.
- **Engine:** `hd_engine_types` year ranges per platform; overlap years 1984/1999/2017 resolved per platform where known, else null.
- `fuel_system`: `efi` when the code ends in `I` and the code without `I` is also a picker code (26 codes). Else `unknown`.
- Upsert on `(year, model_code)`.
- Dry run: 1,671 vehicles (1,492 in master, 179 catalog-only), engine 98.3%. Review 1,461: 1,286 no evidence, 75 multi-year-span only, 100 master-only (engine-era placeholders like `EVOLUTION_BIGTWIN`).
- Known source quirks kept as-is: picker files FXEF (1983 Shovelhead Fat Bob) under FXR and FXS (1978 Shovelhead Low Rider) under Softail.

### 02_parts.mjs — applied 2026-10-23 (26,717 rows)
Source: `hd_oem_catalog_reference.part_number`; repair dictionary = full 5-digit std numbers from reference + `oem_fitment` (23k). Logic in `scripts/etl/lib/parts.mjs` (shared with 03).
1. Classify (after uppercasing, collapsing `--`): `std` `NNNNN-YY[A-ZZZ]` (121,309 rows; 86.7% of distinct also in oem_fitment), `modern` 8-digit + color suffix (23,484), `hardware` 4–5 digit + optional letter (57,853), `short_base` 3–4 digit base (4,222; only 9 numbers confirmed by oem_fitment — samples are 5-digit numbers missing their front digits), `truncated` `NNNNN-`/`NNNNN-D` (21,946), `ocr_suffix` `NNNNN-YYD` = letter read as digit (74), `junk` (10,632 → review).
2. Repair truncated/ocr by prefix, short_base by tail (unless oem_fitment confirms it as-is). One candidate seen in the row's catalog years → `repaired_same_year`; else one anywhere → `repaired_other_year`; else review. Candidates whose `-YY` intro year is after the catalog year are excluded (century rule).
3. `oem_number` = uppercase, no dashes. Collisions keep the most common display (0 after short_base change).
4. `description_clean`: first column segment that starts with a capitalized word; drop parentheticals, `w/ …`/`with …` notes, part numbers, dimensions, non-ASCII; head + one qualifier, ≤60 chars, sentence case. Per number take the most common; names whose first word heads <3 part numbers are OCR noise → dropped.
5. `chain_root` = self.
- Dry run: 225,439 / 239,520 rows resolve (94.1%) → 26,717 parts (25,668 extracted, 1,028 repaired same-year, 21 other-year); description null 5.2%. Review 14,081 rows: junk 10,632, ambiguous same-year 2,316 (mostly color variants, e.g. `73152-96BK`/`-96WE` — parallel options, correctly not picked), no candidate 1,003, ambiguous other-year 128.
- Known leftovers: a few names keep OCR tails (`… eeeeen`, cut words); `1010` carries a figure heading ("Fuel tank & trim california…") — watch for it in 06 concept matching.

### 03_fitment.mjs — applied 2026-10-23 (751,589 rows)
Source: `hd_oem_catalog_reference` rows, part numbers resolved exactly as 02 (`lib/parts.mjs`), `used_on_raw` parsed by `lib/usedon.mjs`; `oem_fitment` for corroboration.
1. `used_on_raw` kinds: `codes` (148,672 rows; tags `103`/`ANV`/`TC`/`SHRINE`/`CVO`/`SE` and glued `…ANV` stripped; `CONV` only for FXDS; a year next to a code wins over the catalog year), `all` (56,248), `family` `DYNA: 93*-ALL` (9,676; `*`/`'`/`•` = and later; no star = that year only), `range` `86 TO * - ALL MODELS` / `86 TO 92 - XLH, XLCH` (7,279; "early/late YY" boundary year → low), `unparsed` (17,645 → review: option-letter scopes like `DYNA: 95*-GE` 8,165, fragments, sidecar notes).
2. **`ALL` scope** = every code listed explicitly in ≥2 rows of the same document, × the row's year. Per-model titles are family catalogs (e.g. "2016 DYNA FAT BOB (FXDF 103)" lists all Dyna codes); the report prints the scope per document — each maps to one platform.
3. Only (code, year) pairs in `vehicles`. Codes missing from `vehicles` are counted (top: FXDBP, XL1200CP, FXDBA/B/C, XL1200CB/CA, XL883HUG, FLHFB) — candidates to add in 01.
4. Bad years skipped (35 rows).
5. Confidence: `low` = repaired number or boundary year; `high` = oem_fitment has the number in a catalog covering that year; else `medium`. One row per (part, vehicle): best confidence, lowest source id. `conditions = '{}'` until 04.
6. `--apply` deletes and reloads all `source='oem_catalog'` rows (re-run 04 afterwards).
- Dry run: 204,453 / 239,520 rows produce fitment (85.4%) → 751,589 fitment rows (high 51.8%, medium 37.3%, low 10.9%); 23,216 / 26,717 parts (86.9%) and 1,042 / 1,671 vehicles (62.4%) get fitment. Vehicles without fitment are catalog gaps: CVO/SE, 2020–24 Softail, Rev Max, Street, Trike, pre-1950, and older Sportster catalogs that say `XLH` rather than `XLH883`.

### 04_conditions.mjs — tags + fuel system
1. Regex tags from `description` + `used_on_raw` using `condition_tags.patterns`. Do **not** use `category` (sticky `INTERNATIONAL MODELS ONLY` heading on 35,969 rows); `hdi` only from line text.
2. Tighten patterns per discovery: `california` from "(California only)", "(49 state, California)"; `carb` must not match part names like "HOSE, vacuum carburetor" — only qualifiers ("carbureted models", "w/ carb").
3. Drop `cvo`, `cable_clutch`, `hydraulic_clutch` from the starter set until data shows them (0 / 10 hits).
4. EFI/carb inference: where a concept has different parts for an `…I` code and its non-`I` sibling in the same year, tag `efi` / `carb` with `condition_source='inferred'`.
5. Re-sort/dedupe `conditions`; report counts per tag and source.

### 05_supersession.mjs — real supersession only
1. **Do not load** the 283 `oem_supersession` rows: all `inferred` letter bumps, which the domain rule says are parallel options.
2. Mine `(use NNNNN-YY[A])` notes from reference descriptions and `oem_fitment.qty_note` (40+ rows) as `from → to`, `source='catalog_use_note'`.
3. Compute `chain_root` (recursive, cycle-safe); cycles → review file.

### 06_concepts.mjs — unchanged from ROADMAP
Seeds → `part_concepts`; match `hd_terms` against `description_clean`; report per-term counts; 0-match terms fixed before `--apply`.

### 07_bridge_holes.mjs — applied 2026-10-23 with `--max-hole 3` (13,787 rows)
Fills year holes inside spans (gate finding). A hole between two listed years of the same part + model + conditions is bridged only if every hole year has a vehicle row and **no catalog covers that vehicle at all** (no oem_catalog fitment of any part). Bridged rows: `source='inferred_span'`, `confidence='medium'`, conditions copied, `source_ref='bridge:<left>|<right>'`. Runs after 03/04; `--apply` replaces all inferred_span rows. `--max-hole N` caps the hole length.
- Dry run, no cap: 82,671 holes → 15,864 bridged (+32,449 rows); 56,353 kept (a catalog covers the model that year), 10,454 kept (model not produced). Long bridges (5–9 yrs) mostly fill vehicle rows the year master pads (FXDC 1997–2004, FLST 1997–2005, FLHT 2011–18), plus real gaps (FLHC/FLFB/FXBB 2020–24: no Softail catalogs).
- Dry run, `--max-hole 3`: 12,798 bridged (+13,787 rows), spans 284,056 → 271,258; every filled year is a missing catalog year (Softail 2002/2016, Dyna 2006, FXDWG 2009, FXST 1997–98).

### 08_refresh.mjs
`REFRESH MATERIALIZED VIEW CONCURRENTLY fitment_spans`. (Refreshed by hand after 03 for the gate check.)

## Before any script runs `--apply`

- [x] Create `hdchop` DB + app role; set `APP_DATABASE_URL`; run 001 + 002.
- [x] Narrow `hdchop_ro` grants to: `hd_oem_catalog_reference`, `oem_fitment`, `harley_families`, `harley_models`, `harley_model_years`, `hd_year_model_master`, `hd_engine_types`, `hd_family_engine_map`, `model_alias_map` (currently it can read `orders`, customer tables).
- [ ] Review `reports/01_vehicles_review_*.csv` (catalog_span_only rows first).
- [ ] Review the 03 document-scope table and `03_fitment_review_*.csv`.
- [x] Review the 02 repair report (dry run 2026-10-23) and 03 `ALL`-scope map by hand.

## Phase 1 gate (unchanged)
Spot-check 10 known parts by hand (Touring fuel tank, EVO vs Twin Cam primary cover, …). Spans and conditions match reality. Also: review-file sizes are reported and accepted.

### Gate spot-check — 2026-10-23, after 03 (conditions not built yet)
Precision is good; recall is not.
- Right part, right platform/era: Touring tank 61225-98 → 61268-03 (2004–07) → 61268-08 (2008+); Sportster tank 61348-03 (1999–2003) → 61348-04 (2004–06, rubber-mount frame); Touring saddlebag 90xxx-93 → 902004xx (2014+); Twin Cam oil filters 63798-99A / 63731-99A only on 1999+ Dyna/Softail/Touring; Dyna Fat Bob FXDF tank 61586-04A/B vs Softail Fat Bob FXFB 61000675 — the reused name doesn't cross. Only one tank/bag/primary-cover part spans two platforms (60563-08A: FLD + FLS), and the catalogs list it for both.
- **Holes:** spans skip years when a catalog for that year doesn't list the part (61268-08: 2008, 2010, 2013–19). Of 284,056 spans, 129,796 are single-year; 51,223 one-year holes and 13,116 two-year holes between spans of the same part+model.
- **Missing parts:** Evo-era outer primary covers for FLSTC/FXDWG don't show (only gaskets/screws); 63805-80A (Evo oil filter) shows only 1984–86 FXR and 1991.
- **Verdict: not passed yet.** Hole rule decided (bridge only where no catalog covers the model; see 07). Long uncovered runs point at padded vehicle rows in 01. Conditions (04) still to do.

### Gate re-check — 2026-10-23, after 07 (`--max-hole 3`) + refresh
- Spans 284,056 → 271,258 (single-year 129,796 → 121,766). Filled as expected: FLHTC tank 61356-03 now 2003–07; 63798-99A Dyna 2002–08; 60563-08A FLS 2014–17. No new cross-platform tank/bag/primary-cover parts.
- Remaining holes are mostly **repair policy**, not missing catalogs: e.g. FLHR tank 61268-08 skips 2009/2011/2012 because those catalogs print `68-08` (2-digit base → junk), `356-08` and `61356-` (repaired → `low` → hidden from spans).
- Options: (a) `repaired_same_year` → `medium` (unique same-year candidate; `number_source` still marks it), keep `repaired_other_year` low; (b) allow 2-digit front-truncated bases (`68-08`) in short_base tail repair. Then re-run 03 → 07 → 08.
- Verdict: still not passed (recall + conditions).

