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

### 2026-10-23
- Phase: 1 (setup)
- Done: hdchop DB owned by hdchop_app (already had 001 with fixed fitment_spans, empty except 11 condition_tags); pg_hba cleaned (hdchop_user lines removed; hdchop_ro + hdchop_app limited to 35.139.71.102/32 scram; claude_ro md5 → scram; catalog_app untouched); hdchop_ro grants narrowed; both .env URLs connect
- Server access: `deploy` may run `sudo -u postgres psql` without password (/etc/sudoers.d/hdchop-claude) and has an rw ACL on pg_hba.conf. Undo: `sudo rm /etc/sudoers.d/hdchop-claude && sudo setfacl -x u:deploy /etc/postgresql/15/main/pg_hba.conf`
- TODO (security): rotate any password shown in screenshots; consider removing deploy from docker group (root-equivalent); server reports "restart required"
- Next: write 002 migration; fix 01_vehicles.mjs platform/EFI; build 02_parts.mjs dry-run; decide on committing package.json / 01_vehicles.mjs / .gitignore (.env* hides .env.example)

### 2026-10-23 (later)
- Phase: 1
- Done: 002_merge_provenance.sql (number_source, confidence, source_ref NOT NULL, lowercase platform CHECK, fitment_spans excludes low, drops cvo/clutch tags) — tested in a rolled-back transaction, NOT applied. Rewrote 01_vehicles.mjs with an evidence gate; dry-run only.
- Numbers: picker 3,032 in-range year×code → 1,671 loadable; review 1,461 (1,286 no evidence, 75 span-only, 100 master-only placeholders); engine 98.3%; 112 EFI rows / 26 codes
- Decisions: picker years need catalog/master confirmation (picker pads years); catalog evidence single-year only; FXLR <2018 = fxr; K series = vintage/flathead
- Next: apply 002 then 01 --apply (needs go-ahead); 02_parts.mjs dry-run

### 2026-10-23 (apply)
- Done: applied 002 to hdchop; ran 01_vehicles.mjs --apply → 1,671 vehicles (211 codes, 1936–2026, engine 1,642, efi 112)
- Spot-checked: 1999 FLHR twin_cam, 1999 FXST evo, 2017 FLHTK M8, 2017 FXDWG twin_cam, 1992 FXLR fxr, 2003 FLHTCUI efi
- Source quirks loaded as-is: FXEF 1983 platform fxr, FXS 1978 platform softail (both Shovelhead FX)
- Next: 02_parts.mjs dry-run

### 2026-10-23 (02_parts)
- Phase: 1
- Done: scripts/etl/lib/parts.mjs (classify/normalize/repair/clean, shared with 03) + 02_parts.mjs; dry-run only, NOT applied
- Numbers: 239,520 rows → 225,439 resolved (94.1%) → 26,717 oem_parts (1,028 repaired same-year, 21 other-year); review 14,081 (junk 10,632, ambiguous 2,444, no candidate 1,003)
- Decisions: 3–4 digit bases treated as front-truncated unless oem_fitment confirms (9 of 2,650 do) — conflicts with the CLAUDE.md "3–4 digit base" century note, which assumes they're real; color-variant ambiguity left unresolved (parallel options)
- Next: apply 02 (needs go-ahead); 03_fitment.mjs dry-run

### 2026-10-23 (02 apply)
- Done: 02_parts.mjs --apply → oem_parts 26,717 (25,668 extracted, 1,028 repaired same-year, 21 other-year); 25,318 with description_clean; chain_root = self for all; trigram "fuel tank" search works
- Known leftover: `1010` has a figure-heading description; some OCR tails in names
- Next: 03_fitment.mjs dry-run
