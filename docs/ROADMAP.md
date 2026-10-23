# Roadmap

Each phase ends with a gate. Don't start the next phase until the gate passes.

## Phase 0 — Discovery (read-only)
- [x] Create read-only role on source DB; set `SOURCE_DATABASE_URL`
- [x] Run `scripts/discovery/*.sql`; save output to `reports/`
- [x] Write findings to `docs/DISCOVERY.md`: real column names, row counts, top descriptions, how often condition text appears
- **Gate:** we know where year/model/fitment/condition data actually lives, and whether conditions survived PDF extraction. If condition coverage is near zero, fix the source extractor first.
- **Status (2026-10-22): passed via revised path.** Original gate failed (row alignment, truncated part numbers). Decision: assemble our own fitment from multiple sources with provenance + confidence instead of fixing the extractor first. 84% of truncated numbers are repairable; the rest go to review files. See DISCOVERY.md + ETL_PLAN.md.
- Optional follow-up: extractor fixes for what the merge can't repair (see DISCOVERY.md "Extractor fixes").
  - **Status: CLEAR.** Conditions survived (sparse: 0–2.4% per tag, see docs/DISCOVERY.md) and column locations are known. `oem_part_timeline` being empty is explained (wiped by Stinkin-Supplies' 2026-07-18 `catalog_unified` TRUNCATE CASCADE incident, never rebuilt — not something HD Chop needs to depend on). Unmatched `oem_fitment` rows (61.4%) are in scope: `matched_product_id` is Stinkin-Supplies-internal and irrelevant to fitment correctness — ETL reads all rows, ignores match columns entirely. Phase 0 done; ready for Phase 1.

## Phase 1 — Database + merge ETL
Plan and per-script detail: `docs/ETL_PLAN.md`.
- [ ] Create `hdchop` DB + app role; run `001_core.sql` + `002_merge_provenance.sql`
- [ ] Narrow `hdchop_ro` grants to the source tables in ETL_PLAN.md
- [ ] ETL scripts (all dry-run by default, `--apply` to write, review CSVs for anything ambiguous):
  - `01_vehicles.mjs` — picker chain (`harley_families`/`harley_models`/`harley_model_years`); fix platform vs engine-era; EFI from `…I` codes
  - `02_parts.mjs` — `hd_oem_catalog_reference` → `oem_parts`; repair truncated numbers from `oem_fitment`
  - `03_fitment.mjs` — parse `used_on_raw`, resolve `ALL` by document scope, confidence from `oem_fitment` agreement
  - `04_conditions.mjs` — regex tags from line text (not `category`); infer carb/EFI from `…I` siblings
  - `05_supersession.mjs` — mine "(use NNNNN-YY)" notes; skip the 283 inferred letter bumps; compute `chain_root`
  - `06_concepts.mjs` — load seeds, assign `oem_parts.concept_id`; report unmatched descriptions by frequency
  - `07_refresh.mjs` — `REFRESH MATERIALIZED VIEW CONCURRENTLY fitment_spans`
- **Gate:** spot-check 10 known parts by hand (e.g. a Touring fuel tank, an EVO vs Twin Cam primary cover). Spans and conditions match reality. Review-file sizes reported and accepted.
- **Status (2026-10-23): spot-check passed; review-file sizes reported, awaiting Laken's acceptance.** 10 parts/cases correct incl. carb vs EFI, ABS vs non-ABS, California vs 49-state, laced wheels, Fat Bob name reuse, Evo vs Twin Cam oil filter. Known recall limits: span holes where catalogs omit a part (43k one-year), 629 vehicles without catalogs, Evo outer primary covers missing. Details: ETL_PLAN.md "Final gate check". Steps 05 (supersession) and 06 (concepts) not built yet.

## Phase 2 — API
- [ ] Scaffold `apps/api` (Next.js 15), read-only DB role
- [ ] `/v1/years`, `/v1/models`, `/v1/search`, `/v1/part/:oem`
- [ ] `search_misses` logging
- **Gate:** "gas tank", "blinkers", "bags", "kickstand", "speedo" return correct results for 5 test bikes across Touring/Softail/Dyna/Sportster.

## Phase 3 — Mobile MVP (free features)
- [ ] Scaffold `apps/mobile` (Expo Router, TS); black/gold theme
- [ ] Screens: Pick bike → Search → Results → Part detail
- [ ] TestFlight build
- **Gate:** 5 riders use it without help.

## Phase 4 — Monetize
- [ ] RevenueCat + StoreKit subscription; API-side gating
- [ ] VIN lookup (NHTSA vPIC), saved garage
- [ ] App Store listing with the not-affiliated notice
- **Gate:** App Review approved.

## Phase 5 — Edge features
- [ ] Salvage-verified fitment (Fallen Cycles), after ownership is confirmed
- [ ] "Find it at Stinkin' Supplies" links
- [ ] Shop tier: bulk lookup / API keys
