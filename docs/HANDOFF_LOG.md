# Handoff log

Append one entry per session. Newest at the bottom.

## Template
### YYYY-MM-DD
- Phase:
- Done:
- Numbers (row counts, matches, misses):
- Decisions:
- Next:

---

### 2026-10-21
- Phase: 0 (not started)
- Done: Repo scaffold, spec, schema draft, discovery SQL, seed lists
- Next: Create source read-only role, run discovery SQL, write docs/DISCOVERY.md

### 2026-10-21
- Phase: 0 (in progress)
- Done: Created `hdchop_ro` read-only role on `stinkin_catalog` (source DB); set `SOURCE_DATABASE_URL` in `.env`
- Decisions: none
- Next:
  - Run discovery SQL, write docs/DISCOVERY.md
  - TODO (security): rotate the `deploy` sudo password and server root password on the catalog DB host — both were typed in plaintext during this provisioning session

### 2026-10-21
- Phase: 0 (in progress)
- Done: Ran all 4 discovery SQL scripts (output in reports/) + a follow-up match-rate query; wrote docs/DISCOVERY.md
- Numbers: oem_fitment = 315,427 rows; only 38.6% (121,869) have a matched_product_id; condition tags present but sparse (carb 1.6%, efi 0.5%, abs 1.4%, cvo 0%, ca/hdi 2.4%, clutch 1.0%); oem_part_timeline is empty (0 rows)
- Decisions: Phase 0 gate is not fully clear yet — holding off Phase 1 ETL
- Next:
  - Figure out why `oem_part_timeline` is empty (unused table vs. not-yet-run population step)
  - Decide policy for unmatched `oem_fitment` rows (61.4%): include as fitment-only data or exclude from v1
  - TODO (security): rotate `deploy` sudo password + server root password (still pending, plaintext exposure during provisioning)

### 2026-10-21
- Phase: 0 (in progress)
- Done: Root-caused the empty `oem_part_timeline` table — see docs/DISCOVERY.md "Why oem_part_timeline is empty". Not a bug: wiped by Stinkin-Supplies' 2026-07-18 `catalog_unified TRUNCATE CASCADE` incident (confirmed via live FK check: `oem_part_timeline.product_id → catalog_unified`), never rebuilt. `oem_fitment` (what HD Chop reads) survived — no FK into `catalog_unified` — which is also why its 38.6% match rate matches Stinkin-Supplies' own recovery notes exactly.
- Decisions: HD Chop does not need `oem_part_timeline` — it backed a Stinkin-Supplies PDP feature, not fitment lookup. HD Chop computes year spans itself per the OEM-number rules already in this file. Not a Phase 0 blocker.
- Next:
  - TODO (security): rotate `deploy` sudo password + server root password (still pending, plaintext exposure during provisioning)

### 2026-10-21
- Phase: 0 → 1 (gate cleared)
- Done: Decided unmatched-`oem_fitment`-rows policy — include all 315,427 rows regardless of `matched_product_id`. That field is Stinkin-Supplies-internal (sellable-in-stock status), not a fitment signal; SPEC.md's `fitment` table has no SKU column and "no prices/vendor names" is an explicit non-goal. ETL step `02_parts_fitment.mjs` ignores `matched_product_id`/`matched_sku`/`match_method`/`match_confidence` entirely.
- Decisions: Phase 0 gate is CLEAR. Ready to start Phase 1 (DB + ETL).
- Next:
  - Phase 1: create `hdchop` DB, run `001_core.sql`, start ETL scripts (01_vehicles.mjs onward)
  - TODO (security): rotate `deploy` sudo password + server root password (still pending, plaintext exposure during provisioning)
  - TODO (cleanup): drop unused `claude_ro` role + its two `pg_hba.conf` lines (35.192.145.209) on the catalog DB server — confirmed by Laken as their own leftover from a prior session, no privileges ever granted, just needs deleting

### 2026-10-21
- Phase: 1 (in progress)
- Done: Created `hdchop` database + `hdchop_user` role on the same self-hosted server as the catalog DB (5.161.100.126); ran `001_core.sql` clean (8 tables, `fitment_spans` matview, 11 starter condition tags). `APP_DATABASE_URL` set in `.env`.
- Decisions: Tried Vercel Marketplace (Neon) first per the storage-provisioning skill, but hit a hard blocker — Vercel disallows agents from linking/provisioning under a Personal Account scope, and the only real Team on this account is "Fallen Cycles" (a different, unrelated business — explicitly didn't want HD Chop under it). Fell back to the self-hosted server instead, same host as `stinkin_catalog` but a separate database/role, no cross-access.
- Next:
  - Start ETL: `01_vehicles.mjs` (vehicles from `harley_families`/`bike_specs`)
  - TODO (security): rotate `deploy` sudo password + server root password (still pending, plaintext exposure during provisioning)

### 2026-10-22
- Phase: 0 (discovery done, gate not passed)
- Done: Fixed fitment_spans concept/index bug; hdchop_ro read-only role on stinkin_catalog (5.161.100.126); ran discovery 01–04 + quality checks; wrote docs/DISCOVERY.md
- Numbers: oem_fitment 315,427 rows / 18,308 part nos, 51% models from page headings; hd_oem_catalog_reference 239,520 rows / 36,110 part nos, 4,851 truncated; oem_supersession 283 (all inferred); oem_part_timeline 0; 26 EFI "…I" model codes / 57,536 refs
- Decisions: none yet (see DISCOVERY.md "Decisions for Laken")
- Next: pick primary fitment table; fix extractor (part-number suffix, sticky headings, per-line models, bad years); narrow hdchop_ro grants; add hd_oem_catalog_reference to DATA_RIGHTS.md

### 2026-10-22 (later)
- Phase: 0 → 1 (planning)
- Done: Decided to assemble fitment from multiple sources; wrote docs/ETL_PLAN.md; updated ROADMAP Phase 0 status + Phase 1 steps; added hd_oem_catalog_reference to DATA_RIGHTS
- Numbers: truncated-number repair 13,884 / 16,503 unique same-year (84%), 887 no candidate; picker chain 3,199 year×model vs master 1,618; reference vehicle_model resolves 87% of non-ALL rows; used_on ALL 55,831 rows
- Decisions: reference table primary; picker chain for vehicles; drop 283 inferred supersession pairs; provenance + confidence columns (002 migration)
- Next: create hdchop DB + app role; narrow hdchop_ro grants; write 002 migration; fix 01_vehicles.mjs platform/EFI; build 02_parts.mjs dry-run
