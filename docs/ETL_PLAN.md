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

### 02_parts.mjs — oem_parts from reference
Source: `hd_oem_catalog_reference.part_number`, with `oem_fitment.oem_part_no` + reference full numbers as the repair dictionary.
1. Classify format: valid `NNNNN-YY[A]` (121,214 rows), dashless hardware/8-digit (87,005), truncated `NNNNN-` (21,959), other/junk (9,342).
2. Repair truncated per (base, year): exactly one full candidate in the same catalog year → `repaired_same_year`; exactly one in another year → `repaired_other_year` (low confidence); otherwise → review file.
3. Junk (`99A`, `79399181352960018`, `6400HB`-style) → review file. Dashless 3–8 digit numbers are kept.
4. Normalize `oem_number` (uppercase, no dashes/spaces); keep `oem_display`.
5. `description_clean`: strip quantity `(2)`, stray fragments (`1`, `2`, `Unkno` → null), trim. Short part name only (DATA_RIGHTS).
6. `chain_root` = self for now (set in 05).

### 03_fitment.mjs — fitment from used_on_raw
Source: `hd_oem_catalog_reference` rows (parts resolved in 02), `oem_fitment` for corroboration.
1. Parse `used_on_raw` shapes: code list (94,100), single code (61,009), `ALL` (55,831), codes with years e.g. `FXR 1993, FXR 1994` (28,580). Year on the code wins over the row's catalog year.
2. **`ALL` scope:** per-model documents (`2015 ROAD KING CLASSIC (FLHRC)`) → that model; family/all-model documents (`2021 Touring Models…`, `1995-96 All 1340cc…`) → every vehicle in that family/years. Build the doc → scope map from `source_document_title` and report it before applying.
3. Resolve (code, year) against `vehicles`; unresolved → review file (baseline: 87% of non-ALL `vehicle_model` resolve).
4. Reject years outside 1903–2027 (~100 bad rows + 182 null).
5. Confidence: `high` = same number + year also in `oem_fitment` and number not repaired; `medium` = reference only, number extracted; `low` = repaired number or other-year repair.
6. `source='oem_catalog'`, `source_ref='hd_oem_catalog_reference:<id>'`.

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

### 07_refresh.mjs
`REFRESH MATERIALIZED VIEW CONCURRENTLY fitment_spans`.

## Before any script runs `--apply`

- [x] Create `hdchop` DB + app role; set `APP_DATABASE_URL`; run 001 + 002.
- [x] Narrow `hdchop_ro` grants to: `hd_oem_catalog_reference`, `oem_fitment`, `harley_families`, `harley_models`, `harley_model_years`, `hd_year_model_master`, `hd_engine_types`, `hd_family_engine_map`, `model_alias_map` (currently it can read `orders`, customer tables).
- [ ] Review `reports/01_vehicles_review_*.csv` (catalog_span_only rows first).
- [ ] Review the 02 repair report and 03 `ALL`-scope map by hand.

## Phase 1 gate (unchanged)
Spot-check 10 known parts by hand (Touring fuel tank, EVO vs Twin Cam primary cover, …). Spans and conditions match reality. Also: review-file sizes are reported and accepted.
