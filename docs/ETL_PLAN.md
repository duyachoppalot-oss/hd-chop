# Phase 1 — Merge ETL plan

Builds `hdchop` from several source tables (decision: DISCOVERY.md, 2026-10-22). Numbers below are from discovery; each script re-measures them in its dry-run report.

## Principles

- Field-level source of truth (table in DISCOVERY.md). Other sources only corroborate or repair.
- Every fitment row carries `source_ref` (source table + row id) and a `confidence`.
- Anything ambiguous, unresolvable or contradictory goes to `reports/<script>_review_<ts>.csv`, not into `hdchop`. The review files are the to-do list for extractor fixes.
- All rules from CLAUDE.md apply: SELECT-only on source, dry-run by default, `--apply` to write, report with counts + 20 samples, no invented numbers/years/fitment.

## Schema changes — `002_merge_provenance.sql`

| Table | Change | Why |
|---|---|---|
| `oem_parts` | `number_source text NOT NULL` (`extracted` \| `repaired_same_year` \| `repaired_other_year`) | Show/filter repaired numbers |
| `fitment` | `confidence text NOT NULL` (`high` \| `medium` \| `low`) | Two-source agreement vs one source vs repaired |
| `vehicles` | `platform` values lowercase (`touring`, `softail`, `dyna`, `sportster`, `fxr`, `trike`, `v_rod`, `street`, `revolution_max`, `vintage`) | Matches 001 comment; engine eras are not platforms |

`fitment_spans` filters to `confidence IN ('high','medium')` by default; `low` stays queryable for review.

## Scripts (`scripts/etl/`)

### 01_vehicles.mjs — exists, needs changes
Source: picker chain `harley_families → harley_models → harley_model_years` (3,199 year×model).
- **Fix platform:** `harley_families` mixes platforms with engine eras (`Evolution`, `Twin Cam`). When a model code appears under both, take the platform family; never write an engine era to `platform`. Current dedupe keeps whichever row comes first — make it deterministic.
- Lowercase platform values per 002.
- `fuel_system`: `efi` for `…I` codes (30 in picker). Everything else stays `unknown` here; step 04 may refine.
- Report: picker vs `hd_year_model_master` diff (1,681 picker-only, 100 master-only). Do not auto-add master-only rows; list them for review.

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

- [ ] Create `hdchop` DB + app role; set `APP_DATABASE_URL`; run 001 + 002.
- [ ] Narrow `hdchop_ro` grants to: `hd_oem_catalog_reference`, `oem_fitment`, `harley_families`, `harley_models`, `harley_model_years`, `hd_year_model_master`, `hd_engine_types`, `hd_family_engine_map`, `model_alias_map` (currently it can read `orders`, customer tables).
- [ ] Review the 02 repair report and 03 `ALL`-scope map by hand.

## Phase 1 gate (unchanged)
Spot-check 10 known parts by hand (Touring fuel tank, EVO vs Twin Cam primary cover, …). Spans and conditions match reality. Also: review-file sizes are reported and accepted.
