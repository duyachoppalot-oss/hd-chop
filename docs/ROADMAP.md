# Roadmap

Each phase ends with a gate. Don't start the next phase until the gate passes.

## Phase 0 — Discovery (read-only)
- [ ] Create read-only role on source DB; set `SOURCE_DATABASE_URL`
- [ ] Run `scripts/discovery/*.sql`; save output to `reports/`
- [ ] Write findings to `docs/DISCOVERY.md`: real column names, row counts, top descriptions, how often condition text appears
- **Gate:** we know where year/model/fitment/condition data actually lives, and whether conditions survived PDF extraction. If condition coverage is near zero, fix the source extractor first.

## Phase 1 — Database + ETL
- [ ] Create `hdchop` DB; run `001_core.sql`
- [ ] ETL scripts (all dry-run by default, `--apply` to write):
  - `01_vehicles.mjs` — vehicles from `harley_families` / `bike_specs` (fuel_system, engine, platform)
  - `02_parts_fitment.mjs` — `oem_fitment` → `oem_parts` + `fitment` (valid OEM formats only, normalized)
  - `03_supersession.mjs` — copy pairs, compute `chain_root` (recursive, cycle-safe)
  - `04_conditions.mjs` — regex-tag `fitment.conditions` from source text using `condition_tags.patterns`
  - `05_concepts.mjs` — load seeds, assign `oem_parts.concept_id` by `hd_terms`; report unmatched descriptions by frequency
  - `06_refresh.mjs` — `REFRESH MATERIALIZED VIEW CONCURRENTLY fitment_spans`
- **Gate:** spot-check 10 known parts by hand (e.g. a Touring fuel tank, an EVO vs Twin Cam primary cover). Spans and conditions match reality.

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
