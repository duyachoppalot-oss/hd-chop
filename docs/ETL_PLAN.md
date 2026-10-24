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

### 01_vehicles.mjs — applied 2026-10-23 (1,671 rows); re-applied 2026-10-24 (1,807 rows)
Source: picker chain `harley_families → harley_models → harley_model_years` (3,199 year×model).
- **Evidence gate:** the picker pads years (FLT "Tour Glide" 1939–2026, XL 1936–52, FX 1941–2026). A row loads only if `hd_year_model_master`, `oem_fitment.model_codes` or a code token in reference `used_on_raw`/`vehicle_model` confirms that year. Catalog evidence counts only from single-year rows; bare `FL`/`FX`/`XL` tokens are family abbreviations and need the master.
- **Platform:** lowercase from family. Flathead/Knucklehead/Panhead/Shovelhead are engine eras → `vintage`, or platform from the other family when listed under both (engine from the era family). K series (Sportster family, `filter_group='VINTAGE'`) → vintage/flathead. FXLR under FXR + Softail before 2018 → `fxr`. Other conflicts → review.
- **Engine:** `hd_engine_types` year ranges per platform; overlap years 1984/1999/2017 resolved per platform where known, else null.
- `fuel_system`: `efi` when the code ends in `I` and the code without `I` is also a picker code (26 codes). Else `unknown`.
- Upsert on `(year, model_code)`.
- Dry run: 1,671 vehicles (1,492 in master, 179 catalog-only), engine 98.3%. Review 1,461: 1,286 no evidence, 75 multi-year-span only, 100 master-only (engine-era placeholders like `EVOLUTION_BIGTWIN`).
- Known source quirks kept as-is: picker files FXEF (1983 Shovelhead Fat Bob) under FXR and FXS (1978 Shovelhead Low Rider) under Softail.

- **2026-10-24, applied:** 4th evidence source = model codes in the scraped service-portal catalogs (`lib/servicecatalog.mjs`; single-year books, or `CODE YYYY` in multi-year books). Confirms picker rows only, never adds a model. 1,671 → **1,807** vehicles (+136 backed only by that source): Police touring (FLHP/FLHTP…), V-Rod (VRSCA/B/D/DX/F/R/AW…), numbered CVO (FLHTCUSE2–8, FLHRSE4–5, FLTRXSE2, FXSTDSE2…), 2002 Softail EFI codes, FXR2–4, XR 2008–10. Picker fix: FXDRS is the FXDR 114 Softail (its catalog: "YV=FXDRS FXDR114"), not Dyna "Low Rider S". Generic `VRSC` stays out (family code). These vehicles depend on the DATA_RIGHTS open terms question for that source.
- Downstream dry runs after the re-apply (nothing else applied): **03** 751,135 → 754,556 fitment (+3,421, all via `FLT: 95*-ALL` family rows now reaching Police touring — check before applying 03 that police bikes really take every touring part in those rows); vehicles with fitment 1,042 → 1,047. **09** new pairs 502,867 → 646,406 (+143,539; V-Rod 36,895), vehicles getting their first fitment 185 → 318. Still missing from the picker/vehicles: FXDP, XL1200 (plain), XL883HUG, XL1200CP/CB/CA, FLHRSE5, FLTRSE3, FLHPE/FLHPI, Buell BLAST.
- Until 03/09 are applied the new vehicles have no fitment, so `/v1/models` lists them greyed out ("no parts data yet").

### 02_parts.mjs — re-applied 2026-10-23 (26,460 rows)
Source: `hd_oem_catalog_reference.part_number`; repair dictionary = full 5-digit std numbers from reference + `oem_fitment` (23k). Logic in `scripts/etl/lib/parts.mjs` (shared with 03).
1. Classify (after uppercasing, collapsing `--`): `std` `NNNNN-YY[A-ZZZ]` (121,309 rows; 86.7% of distinct also in oem_fitment), `modern` 8-digit + color suffix (23,484), `hardware` 4–5 digit + optional letter (57,853), `short_base` 2–4 digit base (4,961; only 9 numbers confirmed by oem_fitment — samples are 5-digit numbers missing their front digits; 2-digit like `68-08` added 2026-10-23), `truncated` `NNNNN-`/`NNNNN-D` (21,946), `ocr_suffix` `NNNNN-YYD` = letter read as digit (74), `junk` (10,632 → review).
2. Repair truncated/ocr by prefix, short_base by tail (unless oem_fitment confirms it as-is). One candidate seen in the row's catalog years → `repaired_same_year`; else one anywhere → `repaired_other_year`; else review. Candidates whose `-YY` intro year is after the catalog year are excluded (century rule). **Name check** (added 2026-10-23): candidates whose catalog names don't share the row's head word are dropped; tail repairs need a known matching name. Without it, head-word agreement was 91% (truncated), 82–93% (short_base). Rejects 1,056 rows (`name_mismatch`) + 123 (`name_unverified`), resolves 265 formerly ambiguous. `--apply` also deletes parts no longer produced, with their fitment (270 on re-apply).
3. `oem_number` = uppercase, no dashes. Collisions keep the most common display (0 after short_base change).
4. `description_clean`: first column segment that starts with a capitalized word; drop parentheticals, `w/ …`/`with …` notes, part numbers, dimensions, non-ASCII; head + one qualifier, ≤60 chars, sentence case. Per number take the most common; names whose first word heads <3 part numbers are OCR noise → dropped.
5. `chain_root` = self.
- Dry run: 225,439 / 239,520 rows resolve (94.1%) → 26,717 parts (25,668 extracted, 1,028 repaired same-year, 21 other-year); description null 5.2%. Review 14,081 rows: junk 10,632, ambiguous same-year 2,316 (mostly color variants, e.g. `73152-96BK`/`-96WE` — parallel options, correctly not picked), no candidate 1,003, ambiguous other-year 128.
- Known leftovers: a few names keep OCR tails (`… eeeeen`, cut words); `1010` carries a figure heading ("Fuel tank & trim california…") — watch for it in 06 concept matching.

### 03_fitment.mjs — re-applied 2026-10-23 (751,135 rows)
Source: `hd_oem_catalog_reference` rows, part numbers resolved exactly as 02 (`lib/parts.mjs`), `used_on_raw` parsed by `lib/usedon.mjs`; `oem_fitment` for corroboration.
1. `used_on_raw` kinds: `codes` (148,672 rows; tags `103`/`ANV`/`TC`/`SHRINE`/`CVO`/`SE` and glued `…ANV` stripped; `CONV` only for FXDS; a year next to a code wins over the catalog year), `all` (56,248), `family` `DYNA: 93*-ALL` (9,676; `*`/`'`/`•` = and later; no star = that year only), `range` `86 TO * - ALL MODELS` / `86 TO 92 - XLH, XLCH` (7,279; "early/late YY" boundary year → low), `unparsed` (17,645 → review: option-letter scopes like `DYNA: 95*-GE` 8,165, fragments, sidecar notes).
2. **`ALL` scope** = every code listed explicitly in ≥2 rows of the same document, × the row's year. Per-model titles are family catalogs (e.g. "2016 DYNA FAT BOB (FXDF 103)" lists all Dyna codes); the report prints the scope per document — each maps to one platform.
3. Only (code, year) pairs in `vehicles`. Codes missing from `vehicles` are counted (top: FXDBP, XL1200CP, FXDBA/B/C, XL1200CB/CA, XL883HUG, FLHFB) — candidates to add in 01.
4. Bad years skipped (35 rows).
5. Confidence (revised 2026-10-23): `low` = repaired from another year or boundary year; `high` = number read as-is and oem_fitment has it in a catalog covering that year; else `medium` (includes `repaired_same_year`). Re-apply: high 389,165, medium 360,139, low 1,831. One row per (part, vehicle): best confidence, lowest source id. `conditions = '{}'` until 04.
6. `--apply` deletes and reloads all `source='oem_catalog'` rows (re-run 04 afterwards).
7. **Police (2026-10-24, not yet re-applied):** a family row (`FLT: 95*-ALL`) reaching a police model (`POLICE_CODE` in `lib/fitment.mjs`) gives `low`: civilian books never list police codes and the 1995 police book confirms only 72% of those pairs (mirrors, wheels, reflectors differ). Dry run: low 1,832 → 7,632; ~2,400 existing FXRP pairs drop out of search on re-apply. Police fitment should come from the police books (09). Check: `scripts/dev/check_police_family.mjs`.
- Dry run: 204,453 / 239,520 rows produce fitment (85.4%) → 751,589 fitment rows (high 51.8%, medium 37.3%, low 10.9%); 23,216 / 26,717 parts (86.9%) and 1,042 / 1,671 vehicles (62.4%) get fitment. Vehicles without fitment are catalog gaps: CVO/SE, 2020–24 Softail, Rev Max, Street, Trike, pre-1950, and older Sportster catalogs that say `XLH` rather than `XLH883`.

### 04_conditions.mjs — applied 2026-10-23
Re-targets catalog rows exactly as 03 (`lib/fitment.mjs`, now shared) and tags `source='oem_catalog'` fitment. Rules in `lib/conditions.mjs`.
1. **Markets** are lists, mostly parenthesised: "(california, canada, domestic)", "(hdi, australia, england)", "(except japan)", "(cal. only)" — parsed as lists, not regex. "Domestic" = all US (gate check: on reflectors/lamps/footboards it only contrasts with HDI); 49-state-only needs "49 state" or "except california". Result: both US markets → no tag; 49-state only → **`non_california`** (new tag); California only → `california`; neither → `hdi`. Unclosed trailing lists cut mid-word drop the cut token. `category` never used.
2. Other tags only from qualifier pieces (split on `,` `(` `)` ` - `), never a part's own name: `abs`/`non_abs` ("harness - non-abs", "(abs)"), `efi`/`carb` ("fuel injected models", "w/ efi", ", efi"; "carbureted models"), `cast_wheel` ("cast wheel(s)"), `laced_wheel` ("laced", "wire/spoke wheel"). "9 spoke" = cast style; "wire" = mostly electrical, so neither counts alone.
3. Per (part, vehicle) over all contributing rows: tags unioned; markets unioned (a row without a market list covers all). Contradictions (abs+non_abs, efi+carb, cast+laced) dropped → review.
4. EFI/carb inference: in years where both X and XI exist and are catalog-covered (84 pairs, 1995–2006), part fits XI not X → `efi` on XI; X not XI → `carb` on X. `condition_source='inferred'` when only inferred tags.
5. `--apply` updates fitment and upserts `condition_tags` (labels + patterns, `\b`→`\y`). Re-run 07 and 08 after.
- Dry run: all 751,135 catalog fitment keys matched. Tagged rows: hdi 23,234; carb 6,464; efi 4,371; california 3,215; non_california 2,874; abs 2,651; laced 1,406; non_abs 671; cast 544. condition_source: catalog_text 34,860, inferred 9,882, none 706,393. 132 contradictions dropped.
- Caveat: inferred carb/efi is mostly fuel-system parts (carburetor, needle, float, jets / fuel, throttle, regulator, sensor), but also screws, springs, washers, terminals — likely carb internals / EFI wiring, not verifiable from the data. Kept as `inferred` so the app can show it softer.
- Applied (after the domestic fix): hdi 23,303; carb 6,464; efi 4,371; california 3,146; abs 2,651; laced 1,406; non_abs 671; cast 544; non_california 164 (all emissions parts: evaporative lines, vent hoses, valve-to-atmosphere tubes). catalog_text 32,160, inferred 9,904.

### 05_supersession.mjs — applied 2026-10-23 (162 pairs, 128 chain roots)
1. **Do not load** the 283 source `oem_supersession` rows (all `inferred` letter bumps = parallel options).
2. Mine reference descriptions: `(use X)` → line → X; `(replaces X & Y)` → X, Y → line. Skip `use w/ …`, `also order …`. Line numbers resolve as in 02. `oem_fitment` notes only corroborate (misaligned rows); pairs seen only there → review.
3. Pairs whose part names have different head words → review (mostly "piece now sold as assembly": idler gear → complete starter; chaining would merge different parts' spans). A newer number with an older `-YY` is allowed (HD consolidates onto older numbers) and counted. An explicit "use" note on a same-year letter bump (74420-94 → 74420-94C) is accepted — catalog text beats the parallel-options default.
4. `chain_root`: follow to the end; numbers replaced by several (left/right splits) or cycles keep themselves; the chain stops at the last number in `oem_parts`.
- Dry run: 1,120 note lines → 270 pairs (161 also in oem_fitment) → 162 accepted (22 with older-suffix target), 128 parts get a new chain_root; chains 2: 102, 3: 7, 4: 4; no cycles. Review 322: unresolved line number 161, name mismatch 108, oem_fitment-only 40, replaced-by-several 13.

### 06_concepts.mjs — applied 2026-10-23 (4,684 parts)
Seed `data/seed/concepts_seed.csv` (now with `match` and `exclude_terms` columns). Each name gives a head phrase and a reversed phrase ("Cover, primary" → "primary cover"), split on `,` and ` - `, with and without filler words (assembly, kit, set…). `head` mode: phrase must end with the term (noun agrees — "Gasket, primary cover" is a gasket). `contains` mode for component families (Tour-Pak, air cleaner). Excludes match anywhere. Head beats contains, then longest term.
- Seed fixes from real wording: Harley says "rear fork" (swingarm), "fork slider & tube"/"slider" (fork tube), "cover, clutch"/"inspection cover, clutch" (derby cover), "pad kit"/"pad set" (brake pads), "cover, pushrod"; narrowed rotor → "brake rotor", regulator → "voltage regulator", filler cap → "fuel filler cap"; excluded seat/lower fairing, clutch master cylinder, fob battery; master cylinder concept renamed "Brake Master Cylinder". Synonyms with no catalog match moved from hd_terms to user_terms (still searchable).
- Dry run: 67 concepts, 88 hd_terms, 0 zero-match terms, 0 empty concepts, 0 ties. 4,524 parts assigned (52,532 fitment rows of 767,788 — the rest is hardware: screws, washers, gaskets…, reachable via the trigram fallback).
- Search spot-check (scripts/dev/search.mjs, SPEC pipeline) found three seed gaps, fixed before the final apply: tail lamps are named "Light assembly, tail lamp" (added "tail lamp light"); "pad & pin kit" cleaned to "pad pin kit" and caught pins-only kits (dropped); Touring bags are listed as components ("Saddlebag cover, right") → saddlebag is now a `contains` concept. Final: 4,684 parts in 67 concepts.

- **2026-10-24 dry run (not applied):** seed precision — `seat` excludes spring/valve/clutch/fairing seats; `saddlebag` excludes mounting hardware, labels, medallions, reflectors (the 2004 FLHR's only "saddlebag" was label 90820-93D); `headlamp` gains "headlamp lens" (Road King 67755-81A "Lens, headlamp"). **Section rules** (`lib/concepts.mjs` `SECTION_RULES`, source `category` used internally): generic "Fender"/"Lens" names get front/rear fender or head/turn/tail lamp from the sections they're listed in; rules compete, winner needs ≥75% of votes and ≥25% of the part's rows ("INTERNATIONAL MODELS ONLY" ignored). Result: 60 parts by section (front fender 42, rear 13, turn signal 3, headlamp 1, tail lamp 1). Gate bikes: front fender 0→1 on FLHX/FLSTC/FXDL/XL883; seat → real seats only; FLHX saddlebag 11→7; 2004 FLHR saddlebag 1→0. 2004 FLHR headlamp/front fender stay 0 until 09 adds its fitment. 06 report now prints gate-bike concept changes.

### 07_bridge_holes.mjs — re-applied 2026-10-23 with `--max-hole 3` (16,871 rows)
Fills year holes inside spans (gate finding). A hole between two listed years of the same part + model + conditions is bridged only if every hole year has a vehicle row and **no catalog covers that vehicle at all** (no oem_catalog fitment of any part). Bridged rows: `source='inferred_span'`, `confidence='medium'`, conditions copied, `source_ref='bridge:<left>|<right>'`. Runs after 03/04; `--apply` replaces all inferred_span rows. `--max-hole N` caps the hole length.
- Dry run, no cap: 82,671 holes → 15,864 bridged (+32,449 rows); 56,353 kept (a catalog covers the model that year), 10,454 kept (model not produced). Long bridges (5–9 yrs) mostly fill vehicle rows the year master pads (FXDC 1997–2004, FLST 1997–2005, FLHT 2011–18), plus real gaps (FLHC/FLFB/FXBB 2020–24: no Softail catalogs).
- Dry run, `--max-hole 3`: 12,798 bridged (+13,787 rows), spans 284,056 → 271,258; every filled year is a missing catalog year (Softail 2002/2016, Dyna 2006, FXDWG 2009, FXST 1997–98).

### 08_refresh.mjs
`REFRESH MATERIALIZED VIEW CONCURRENTLY fitment_spans`. (Refreshed by hand after 03 for the gate check.)


### 09_service_catalog.mjs — applied 2026-10-24 (657,791 fitment rows, 20,913 parts)
Second fitment source: `~/Developer/catalog-extract/rows/*.tsv`, 391 HD parts catalogs (1991–2027) scraped from the H-D service portal (DATA_RIGHTS row + open terms question). Why: stinkin_catalog's year-range books are partial (2004-touring 22 of ~244 pages) and ~9% of its numbers are cut at the hyphen.
1. Only 7-column lines are fitment (852,048). 5-column lines are the numeric part index at the back of each book (no models; filed under the last section) → skipped; 6-column sidecar cross-refs skipped. Years per book from `manifest.json`.
2. Models column → same parser/targeter as 03 (`lib/usedon.mjs`, `lib/fitment.mjs`); confidence as 03 (high = oem_fitment corroborates); conditions as 04 (`lib/conditions.mjs`) without the X/XI inference.
3. Merge: pairs already in `fitment` (any source) count as agreement and are left alone; only new pairs would load as `source='service_catalog'`, `source_ref='catalog_extract:<book>:<line>'`. New numbers → `oem_parts` (`extracted`, `cleanDescription`, chain_root self; `**RESTRICTED SALES PART**` stripped).
4. Concept preview for new parts uses `lib/concepts.mjs` (06's matcher, moved out; 06 dry-run report verified identical).
- Dry run (reports/09_service_catalog_20261024_015836.txt): 1,184,717 (part, vehicle) pairs; **681,850 already in fitment (57.6% agreement)**; **502,867 new** (high 52.1%, medium 47.9%); 15,473 new parts (4,450 with a concept); 185 vehicles get their first fitment (2020s Softail/Rev Max/Trike/Street, CVO years).
- Gate bikes (high+medium pairs): 2004 FLHR 583 → 1,230; 2010 FLHX +50; 2005 FLSTC +14; 2004 FXDL +1; 2004 XL883 +0. 2004 FLHR: mirror 0→2, seat 0→5, brake rotor 0→3, primary cover 0→1, saddlebag 1→11.
- Not fixed by this source: headlamp/front fender stay 0 — books name them "LENS, less bulb with boot", "BULB", "FENDER" and only the section title says headlamp/front fender → needs section-aware concept matching (06). Concept precision: `seat` catches "SEAT, clutch spring"; `saddlebag` (contains) catches supports/brackets/latches and the decal 90820-93D.
- Review: 254,796 rows — mostly codes absent from `vehicles` (CVO numbered SE2–SE8, V-Rod VRSC*, Police FLHP*, LiveWire, Buell) → candidates for 01.
- **Applied 2026-10-24** (Laken accepted the open terms question for now). `003_part_source.sql` adds `oem_parts.source` (`oem_catalog` | `service_catalog`); 02 only deletes its own parts; 03 `--apply` also clears `service_catalog` + `inferred_span`; 09 merges against 03's rows only and its `--apply` replaces its own rows plus `inferred_span`; 07 counts both catalog sources as coverage. **Pipeline order: 03 → 04 → 09 → 05 → 06 → 07 (`--max-hole 3`) → refresh.** Removal SQL in 003.
- Apply results: 657,791 pairs (high 321,175 / medium 336,616), 20,913 parts; 05 chain_root changed on 2 parts; 06 concepts on 10,597 parts (was 4,711); 07 12,806 inferred_span (was 16,653 — books now cover years that were bridged); fitment_spans 291,429 → 406,748.
- Live gate (`reports/gate_public_after09.txt`): 25/25 answer; 2004 FLHR bags 0 → 7, spans continuous (e.g. 68766-94 1994–2022); 2004 models with parts 37 → 42. 2004 FLHR now: mirror 91840-03B/91845-03B, headlight 67755-81A, front fender 59087-00B, seat rider/passenger, brake discs ×3, primary cover 60665-99B. 2006 VRSCA gas tank → 62921-01.

### Final gate check — 2026-10-23, after 04 → 07 (`--max-hole 3`) → refresh
State: 751,135 catalog fitment + 16,653 inferred_span; 292,437 spans over 22,993 parts, 22,555 spans with conditions.
| # | Check | Result |
|---|---|---|
| 1 | FLHR fuel tank | 61225-98 1998–99 {} / 2000–02 {carb} (EFI Road King tank differs); 61268-03 2004–07; 61268-08 2008, 2010, 2013–19; 61000691 2020–21 |
| 2 | Carb vs EFI, 2003 FLHTC / FLHTCI | carburetor 27412-99D {carb}; induction module, throttle body, injectors 27609-01B {efi} |
| 3 | ABS vs non-ABS, 2012 FLHR front brake line | 43350-08 {non_abs}; 40612-09, 41679-09 {abs} |
| 4 | California vs 49-state, 1996 FLHTCU | carburetor 27505-96 + 1.80 mm jet {california,carb}; 27493-96 + 1.75 mm jet {carb} |
| 5 | Wheels, 2005 FLSTC | wheel assemblies {laced_wheel} |
| 6 | Market tags, 2015 FLHR | remote fob, illuminated switch {hdi}; evaporative line {non_california}. Before the fix, reflectors/headlamp/footboard were wrongly non_california |
| 7 | Sportster tank | 61348-03 1999–2003 → 61348-04 2004–06 → 61348-07 2007–08 |
| 8–9 | Fat Bob name reuse | Dyna FXDF 61586-04A/B vs Softail FXFB 61000675 |
| 10 | Evo vs Twin Cam oil filter, FLSTC | 63796-77A 1991–98 → 63798-99A 1999–2015 |
- **Verdict: passed** on correctness. Recall limits accepted as known: span holes where a catalog omits a part (≈43k one-year), 629 vehicles without catalogs, Evo outer primary covers missing.
- Review files to accept: 01 vehicles 1,461 rows; 02 parts 14,295 rows; 03 fitment ≈26.9k rows; 04 conditions 132 contradictions.

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

### Gate re-check 2 — 2026-10-23, after repair-policy change (02 → 03 → 07 → refresh)
- Spans 287,575 over 22,993 parts (was 271,258 / 22,099). One-year holes 51,223 → 43,114.
- Filled: FLHR tank 61225-98 1998–2002; FLHTC 61356-08 2008–11, 2013; Dyna Fat Bob 61586-04B 2010, 2012–17; Sportster 61348-07 2007–08; 63798-99A FLSTC 1999–2015 continuous. Still one cross-platform tank/bag/primary-cover part (60563-08A, catalog-confirmed).
- Left as-is: FLHR 61268-08 2009 (`68-08` matches 61268-08 and 75168-08, both "Fuel …" — genuinely ambiguous); 2011–12 not listed in those catalogs.
- Verdict: recall acceptable for spot-checked parts; gate waits on conditions (04).

