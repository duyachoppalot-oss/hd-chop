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

### 2026-10-23 (03_fitment)
- Phase: 1
- Done: lib/usedon.mjs (used_on_raw parser), makeResolver() moved into lib/parts.mjs (02 output unchanged, verified), 03_fitment.mjs; dry-run only, NOT applied
- Numbers: 751,589 fitment rows (high 51.8%, medium 37.3%, low 10.9%); parts covered 86.9%, vehicles 62.4%; review 26.9k rows (option-letter scopes 8,165 largest)
- Decisions: ALL scope from codes the same document lists explicitly (≥2 rows); "FXRS CONV" ≠ FXRS; early/late boundary years low confidence
- Follow-ups: vehicles missing for codes the catalogs use (FXDBP, XL1200CP, FXDBA/B/C, XL1200CB/CA, XL883HUG, FLHFB); option-letter scopes (GE, HX, BJ, KX) unmapped
- Next: apply 03 (needs go-ahead); 04_conditions.mjs

### 2026-10-23 (03 apply + gate spot-check)
- Done: 03_fitment.mjs --apply → 751,589 fitment rows; fitment_spans refreshed (284,056 spans, 22,099 chain roots, 138 models; 4.7 s)
- Gate spot-check: precision good (tanks, bags, oil filters, Fat Bob reuse all on the right platform/era); recall gaps — 51,223 one-year and 13,116 two-year holes inside spans, 46% of spans single-year; Evo outer primary covers missing. Gate NOT passed. Details in ETL_PLAN "Gate spot-check".
- Decision needed: rule for bridging span holes (e.g. bridge a hole only when no catalog in that year covers the model at all)
- Next: decide hole rule; 04_conditions.mjs

### 2026-10-23 (07 bridge holes)
- Done: 07_bridge_holes.mjs (renumbered refresh to 08); dry-run only, NOT applied
- Numbers: 82,671 holes; no cap → 15,864 bridged (+32,449 rows); --max-hole 3 → 12,798 bridged (+13,787 rows), spans 284,056 → 271,258
- Finding: long uncovered runs are mostly vehicle rows the year master pads (FXDC 1997–2004, FLST 1997–2005, FLHT 2011–18) — 01's evidence gate trusts the master; those rows need review
- Decision needed: apply with --max-hole 3 or uncapped

### 2026-10-23 (07 apply + gate re-check)
- Done: 07_bridge_holes.mjs --max-hole 3 --apply → 13,787 inferred_span rows; fitment_spans refreshed concurrently (271,258 spans, 4.2 s)
- Gate re-check: bridged years filled correctly; no new cross-platform errors. Remaining holes traced to repair policy (2009 Touring prints `68-08`/`356-08`; repaired rows are low → hidden)
- Decision needed: repaired_same_year → medium? accept 2-digit front-truncated bases?
- Next: that decision, then re-run 03 → 07 → 08; 04_conditions.mjs

### 2026-10-23 (repair policy change)
- Done: short_base accepts 2-digit bases; name check on all repairs (lib/parts.mjs repair()); repaired_same_year → medium in 03; 02 --apply deletes parts no longer produced. Re-applied 02 → 03 → 07 (--max-hole 3) → refreshed spans.
- Numbers: oem_parts 26,460 (270 removed); fitment 751,135 catalog (high 389,165 / medium 360,139 / low 1,831) + 16,871 inferred_span; spans 287,575 over 22,993 parts; one-year holes 43,114
- Gate: spot-checked tanks/filters now continuous where catalogs list them; no new cross-platform errors. Waits on 04 conditions.
- Next: 04_conditions.mjs

### 2026-10-23 (04_conditions)
- Done: lib/fitment.mjs (03 targeting shared; 03 output verified identical), lib/conditions.mjs, 04_conditions.mjs; dry-run only, NOT applied
- Numbers: 34,860 rows with catalog-text tags, 9,882 inferred-only, 132 contradictions dropped; new tag non_california (49-state)
- Decisions: markets parsed as lists (domestic = 49-state); tags unioned across rows; inferred carb/efi kept with condition_source='inferred'
- Next: apply 04 → re-run 07 (--max-hole 3) → 08 refresh → final gate check

### 2026-10-23 (04 apply + final gate check)
- Done: 04 applied, then fixed the market rule ("domestic" = all US; non_california only for "49 state"/"except california") after the gate check found reflectors/lamps tagged 49-state; re-applied 04 → 07 (--max-hole 3) → refresh
- Numbers: 751,135 catalog + 16,653 inferred_span fitment; 292,437 spans (22,555 with conditions); non_california 2,874 → 164 (all evap/vent parts)
- Gate: 10 checks pass (carb/EFI, ABS, California, laced, Fat Bob, Evo/TC filter, tanks). Verdict passed on correctness; recall limits documented. Awaiting Laken's acceptance of review-file sizes (ROADMAP)
- Next: 05_supersession, 06_concepts (search needs concepts), then Phase 2

### 2026-10-23 (05 + 06 dry runs)
- Phase 1 gate accepted by Laken (ROADMAP).
- Done: 05_supersession.mjs, 06_concepts.mjs; concepts seed gains `match` + `exclude_terms`; dry-run only, NOT applied
- Numbers: 05 — 162 accepted pairs, 128 chain_root changes, 0 cycles, review 322. 06 — 4,524 parts in 67 concepts, 0 zero-match terms, 0 ties
- Next: apply 05 → 06 → 08 refresh; then Phase 2 (API + search)

### 2026-10-23 (05 + 06 apply, search spot-check)
- Done: 05 applied (162 pairs, 128 chain roots); 06 applied (4,684 parts / 67 concepts after seed fixes); fitment_spans refreshed. Added scripts/dev/search.mjs — read-only CLI of the SPEC search pipeline (port to the API in Phase 2).
- Spot-checks (correct): 2004 FLHR / 2003 FLHTC / 2016 FXDF / 2019 FXFB gas tank; 2005 FLSTC blinkers; 2004 XL883 kickstand; 2010 FLHX speedo (kph/dual tagged hdi); 2001 FLHTC tail light (68140-04 replaces 3 older numbers); 2003 FLHTCI throttle body {efi ~inferred}; 2012 FLHR brake pads; 2005 FLSTC primary cover (60543-99B replaces 60543-99); 2007 FXDL swingarm; 1996 FLHTCU carb (49-state vs California); 2008 FLHTCU / 2015 FLHR bags; typo "gas tnak" → Fuel Tank.
- Seed fixes from spot-check: "tail lamp light", dropped "pad & pin kit", saddlebag → contains, "saddlebags" user term
- Phase 2 notes: normalize plurals in query → concept; 2008 FXDB "bags" correctly empty (no OEM bags)
- Next: Phase 2 — API (apps/api) + search endpoint

### 2026-10-23 (Phase 2 API)
- Phase: 2
- Done: apps/api (Next.js 15.5.28, pg 8.23.1): /v1/years, /v1/models (has_parts), /v1/search (SPEC pipeline + singular fallback + trigram fallback + search_misses), /v1/part/:oem (chain + spans); edge cache 1 h; gate script apps/api/scripts/gate.mjs; .claude/launch.json "api" on :3001
- Gate: 25/25 cells correct locally after making jiffy_stand a contains concept (06 re-applied, spans refreshed)
- Not done: hdchop_api role (SQL in packages/db/roles/, needs go-ahead + pg_hba hostssl 0.0.0.0/0), Vercel deploy. Server has ssl=on; node-postgres needs sslmode handling for the server cert.
- Next: create API role → deploy to Vercel → Phase 3 mobile

### 2026-10-23 (API role)
- Done: created hdchop_api on hdchop (no password yet; LOGIN, CONNECTION LIMIT 30, statement_timeout 8s). Verified: SELECT on fitment_spans/vehicles, INSERT on search_misses only (no INSERT fitment / UPDATE oem_parts / DELETE search_misses). pg_hba line 110 `hostssl hdchop hdchop_api 0.0.0.0/0 scram-sha-256`, 0 rule errors, reloaded. Backup: /tmp/pg_hba.conf.bak.20261023_111152 on the server.
- Pending: Laken sets the password (\password hdchop_api); then Vercel APP_DATABASE_URL with SSL; deploy

### 2026-10-23 (API TLS + role test)
- Done: hdchop_api password set (Laken); API pins the server's self-signed cert (apps/api/lib/dbCert.ts, SHA-256 9C:8A:51…:51:27, valid to 2036; checked against the server file over SSH) — URL must not contain sslmode. apps/api/scripts/check-db.mjs: hdchop_api over TLSv1.3 reads fitment_spans (291,429), INSERT search_misses allowed, INSERT fitment / UPDATE oem_parts denied. API_DATABASE_URL added to local .env (git-ignored).
- Blocked: Vercel deploy — only scope is the Fallen Cycles team on Hobby (non-commercial terms); waiting on Laken's choice

### 2026-10-24 (API deploy on Hetzner)
- Phase: 2
- Decision: host the API on the Hetzner DB server instead of Vercel (Laken; Vercel scope was a Hobby team, non-commercial)
- Done: apps/api Dockerfile (standalone) + scripts/deploy/api.sh (rsync, build, swap container, health check, rollback); container hd-chop-api on 127.0.0.1:3001 (~32 MB of 512 MB); nginx + Let's Encrypt at https://hdchop.5.161.100.126.nip.io (Laken)
- Env: ~/hd-chop/api.env (600) copied from local API_DATABASE_URL with host → 127.0.0.1. First two attempts failed auth (typo, then an empty file from running the copy outside the repo)
- Gate: apps/api/scripts/gate.mjs over public HTTPS identical to the run through an SSH tunnel (reports/gate_public.txt)
- Security: removed pg_hba `hostssl hdchop hdchop_api 0.0.0.0/0` (was line 110); 0 rule errors, reloaded. Backup ~/hd-chop/pg_hba.conf.bak.20261024_005656 on the server. Remote hdchop_api login now refused ("no pg_hba.conf entry"); hdchop_app remote access unchanged
- Docs: CLAUDE.md stack + rule 6, apps/api/README.md, ROADMAP, role SQL comments
- Next: real domain before App Store; Phase 3 mobile (apps/mobile, Expo)

### 2026-10-24 (Phase 3 mobile MVP)
- Phase: 3
- Done: apps/mobile (Expo SDK 58, expo-router, React Native 0.88): pick year → pick model (by platform, no-data models greyed) → search (12 quick words) → results (concept chips, part cards with conditions/own-model years/also-fits/replaces, ±10-year toggle, trigram fallback) → part detail (chain + fits by conditions). Black/gold, Oswald + Courier Prime, 56 pt tap targets, not-affiliated footer. API: `Access-Control-Allow-Origin: *` on all responses (apps/api/lib/http.ts) for the web build; deployed.
- Verified: typecheck; walked in the browser pane (Expo web, 375×812): 2004 FLHR blinkers → 68766-94 detail; "fender" → 2 concept chips + empty state; "gasket" → fallback list; toggle (41 → 42 spans); 68140-99 deep link → replaced by 68140-04; Change bike. No console errors. Not run on a real phone or simulator (no Xcode).
- Quick words chosen from counts on the 5 gate bikes; dropped "primary cover" and "seat" (0 parts on 2004 FLHR).
- Data note (Phase 1 follow-up): 2004 FLHR returns 0 for concepts other bikes have — front fender 0 on all 5 gate bikes; mirror, headlamp, seat, brake rotor, muffler 0 on FLHR only. Recall gap in fitment or concept terms.
- Note: test searches with no concept ("gasket", "spark plug", "bearing", "chrome thing") were logged to search_misses.
- Next: Laken tries it in Expo Go; TestFlight needs Xcode/EAS + Apple account; investigate the FLHR recall gap.

### 2026-10-24 (data gap investigation: 2004 FLHR, front fender)
- Phase: 1 follow-up (found while testing Phase 3)
- Cause 1 — partial source catalogs: stinkin_catalog's year-range touring books are partial extracts (2004-touring: 22 of ~244 pages, pages 11-78 missing). Years backed by a single-model book (2001 FLHTCI, 2007 FLHR, 2010 FLHX) have ~2x the fitment. Every 2004 touring model has ~600 fitment rows, not just FLHR.
- Cause 2 — split part numbers: 21,958 of 239,520 source rows (9%; ~41% of 2004-touring) have the number cut at the hyphen ("91840-"). 02 repairs most; 2,051 rows stay ambiguous_same_year (e.g. 91840-03A vs -03B mirror kits) and are dropped. 1,619 split heads have their suffix in the next row ("03B") and could be stitched exactly.
- Cause 3 — front fender: pre-2006 books name it bare "Fender" (62 parts, 600 fitment rows unassigned). Source column `category` ("FENDER, FRONT") is not used by 06.
- Better source found: ~/Developer/catalog-extract/rows/*.tsv (391 books scraped from serviceinfo.harley-davidson.com): full pages, complete numbers, section names. For the 26 books matched by title: 73,749 full numbers vs 18,315 in stinkin_catalog. 2004-touring: 2,793 vs 401.
- Decision needed (Laken): use the TSVs as a second fitment source? Same kind of data as the HD-catalog row in DATA_RIGHTS, but scraped from the HD dealer portal — check its terms. Not built, nothing applied.
- Smaller fixes possible on the current source: stitch next-row suffixes; category-aware concept matching (06).

### 2026-10-24 (09_service_catalog dry run)
- Done: DATA_RIGHTS row for the scraped H-D service-portal catalogs (+ open terms question); lib/concepts.mjs (06 matcher shared; 06 report identical); scripts/etl/09_service_catalog.mjs dry-run only (--apply not implemented). Details + numbers in ETL_PLAN "09_service_catalog.mjs".
- Numbers: 502,867 new fitment pairs, 15,473 new parts, 57.6% of book pairs already in fitment; 2004 FLHR 583 → 1,230 (mirror 0→2, seat 0→5, rotor 0→3).
- Not done: apply; headlamp/front fender need section-aware concepts; seat/saddlebag concept precision; CVO/V-Rod/Police codes missing from vehicles.
- Next: Laken decides on the source → implement --apply → 05-08 → gate.

### 2026-10-24 (01 vehicles: service-catalog evidence, dry run)
- Done: lib/servicecatalog.mjs (TSV reader shared by 01 + 09; 09 report identical); 01 counts model codes in the scraped books as evidence; FXDRS → Softail "FXDR 114" picker fix. Dry run only.
- Numbers: vehicles 1,671 → 1,807 (+136: Police 63, V-Rod 39, Softail 27 incl. numbered CVO, FXR 3, XR 3, Dyna 1).
- Next: apply 01 (upsert, additive) → dry-run 03 and 09 to see the fitment those vehicles pick up.

### 2026-10-24 (01 applied; 03/09 dry runs)
- Applied: 01_vehicles.mjs --apply → 1,807 vehicles (+136; upsert, nothing removed). FXDRS = Softail "FXDR 114".
- Dry runs (not applied): 03 +3,421 fitment (Police via FLT family rows — verify); 09 +143,539 new pairs (646,406 total), 318 vehicles would get first fitment.
- Live API: new vehicles show greyed out in /v1/models until 03/09 are applied.
- Next: decide on 09 (terms question) → write its --apply; check police family rows before re-applying 03.

### 2026-10-24 (Police family-row check, dry run)
- Check: scripts/dev/check_police_family.mjs (read-only) → reports/police_family*.txt. 03 reaches police models through family rows ("FLT: 95*-ALL", "FXR: 91*-ALL"): 5,812 police pairs only that way. Civilian touring books never name police codes (0 rows, 1995–2004); police books from 1996 are supplements (436–581 rows); 1995 is the only full police book in range: 566 of 783 pairs listed (72%); unlisted = police-specific equipment with different numbers (mirrors 91875-82A/91892-82A, wheels, reflectors) plus variant/oversize numbers.
- Change (not applied): lib/fitment.mjs marks family-row pairs on police models (POLICE_CODE) low. 03 dry run: low 1,832 → 7,632; high/medium −5,800 (incl. ~2,400 existing FXRP 1984–94 pairs that would drop out of search on re-apply). Police fitment should come from the police books (09).

### 2026-10-24 (06 concept precision + section rules, dry run)
- Done: seed fixes (seat, saddlebag, headlamp); lib/concepts.mjs SECTION_RULES (generic Fender/Lens by catalog section, competing rules, vote thresholds); 06 reads source categories (SELECT only) and reports gate-bike changes. Dry run only.
- Gate: front fender 0→1 on 4 bikes; seats = real seats; saddlebag hardware/labels out.
- Next: apply 06 → refresh fitment_spans → API gate.

### 2026-10-24 (06 applied, spans refreshed, live gate)
- Applied: 06 --apply (4,711 parts / 67 concepts); fitment_spans refreshed (291,429 rows). Committed as 5faeec7 before applying.
- Live gate (reports/gate_public_after06.txt): all 25 cells answer. Changes: 2004 FLHR "bags" 1 → 0 (the old hit was label 90820-93D; the Road King's real bags only arrive with 09); 2010 FLHX bags 11 → 7 (hardware out), blinkers +68973-00 (lens via section rule); FXDL/XL883 blinkers +68973-00. /v1/models?year=2004 lists 53 models (01 re-apply), 37 with parts.
- Spot checks 2004 FXDL: front fender → 58998-83E; seat → 53078-04 only; headlight → 67677-96B.

### 2026-10-24 (09 applied; 05-07 re-run; live gate)
- Laken accepted the open terms-of-use question for now. Migration 003 (oem_parts.source) applied; 02/03/07 guarded for the second source; 09 --apply written and applied: 657,791 fitment rows, 20,913 parts (all source = 'service_catalog', removable — SQL in 003).
- Re-ran: 05 (chain_root changed on 2), 06 (concepts on 10,597 parts), 07 --max-hole 3 (12,806 inferred_span), fitment_spans 406,748.
- Live gate 25/25; 2004 FLHR bags 7, mirror/headlight/front fender/seat/rotor/primary cover all found; V-Rod searchable.
- Pipeline order now: 03 → 04 → 09 → 05 → 06 → 07 → refresh.
- Next: re-apply 03 with the police rule (then 04 → 09 → 05 → 06 → 07 → refresh); TestFlight prep.

### 2026-10-24 (full pipeline re-run with the police rule)
- Applied in order: 03 (police rule) → 04 → 09 → 05 → 06 → 07 --max-hole 3 → refresh. 09 changed: a low 03 row is replaced by the book's row when a book lists the pair (2,644).
- Final fitment: oem_catalog 751,912 (low 4,988), service_catalog 659,122, inferred_span 12,811; spans 406,351. Live gate unchanged (25/25); police searches use police-book parts (1995 FLHTP mirrors 91875-82A/91892-82A).
- Next: TestFlight prep (needs Apple Developer account + bundle ID).

### 2026-10-24 (TestFlight prep)
- Done: app icon/splash generator (apps/mobile/scripts/make-icons.py; opaque 1024 icon, Android adaptive + mono, favicon); expo-splash-screen (held until fonts load) + expo-system-ui; app.json bundle ID placeholder com.yourname.hdchop, supportsTablet false, ITSAppUsesNonExemptEncryption false; eas.json profiles + submit placeholders. expo-doctor 20/20, expo prebuild clean (ios/ removed after), typecheck OK, app runs on the iPhone 17 simulator. Back-button overlap was iPhone-Duo-only.
- Waiting on Laken: Apple Developer membership, bundle ID, Team ID, ASC app record, Expo account.

### 2026-10-24 (pre-1985 Big Twins, dry run)
- Cause of "only Sportsters for old years": 01 rejected pre-1984 Big Twins (multi-year catalog ranges, bare FX/FL ignored); Panhead/FL/FLT books are PDF-only on the portal and were never downloaded.
- Done (dry run, not applied): 01 range evidence for pre-1985 Big Twin codes; FXS/FXSB pre-1986 → Shovelhead FX family, no name; 01 writes a proposed-vehicles JSON; 03 --vehicles-from previews fitment. +38 Shovelhead FX-family vehicles, each with ~350–430 parts.
- Next: apply 01 → 03 → 04 → 09 → 05 → 06 → 07 → refresh (on go-ahead). Panheads need the PDF catalogs.

### 2026-10-24 (Shovelhead FX family applied)
- Applied: 01 (1,845 vehicles) → 03 (769,865) → 04 → 09 (659,122; 2,644 low rows replaced) → 05 → 06 (10,597 parts) → 07 (12,811) → refresh (407,642 spans).
- Live: 1978 picker now lists FX, FXE, FXS (no name) beside the Sportsters; /v1/years 71 → 73 (1979, 1981 added). 1980 FXB: carburetor 27472-80A, muffler 65397-81A, jiffy stand 50061-36E, oil tank 62483-81, starter 31570-73, mirror 91878-77A. Gate otherwise identical.
- Follow-ups: OCR junk in FX-catalog names ("Muffler, rear oo ceceee", "Mirror kit, 5 rectangular 000.0.00 consists of besides") — tighten cleanDescription; air_cleaner matches "Gasket, air cleaner to carburetor" (add gasket exclude). Panheads need the PDF catalogs.

### 2026-10-24 (OCR junk in names; air cleaner gaskets)
- Done: lib/parts.mjs cleanDescription OCR-junk filter (2,146 distinct names cleaner); air_cleaner excludes gasket|seal. Applied 02 → 03 → 04 → 09 → 05 → 06 → 07 → refresh (oem_catalog 767,297; service 659,122; inferred 12,811; spans 407,660).
- Live: 1980 FXB muffler "Muffler, rear", mirror "Mirror kit, 5 rectangular"; "air cleaner" now empty for FXB (its only hit was the gasket). Gate identical.
- Open: air_cleaner still matches screws/trim ("Screw, air cleaner") — contains mode.

### 2026-10-24 (admin console)
- Added: `apps/admin` (local only, 127.0.0.1:3002). Counter dashboard (stats, models by platform, concepts, search misses); model timeline (every part chain by concept across the model's years, built years shaded); concept timeline (one concept across all models, colored by chain); part page (raw fitment year by year colored by source: catalog / service / inferred / admin / low / hidden; supersession chain); Web (Cytoscape graph: parts ↔ models ↔ concepts, click to expand); notes on parts/models/concepts/general.
- Overrides (`004_admin.sql`, applied): hide fitment → moved to `fitment_hidden`; add fitment → `source='admin'`; rename part; set concept. SQL functions `admin_apply_override(s)` / `admin_undo_override`; console applies + refreshes spans on save; `scripts/etl/08_overrides.mjs` re-applies after every rebuild (pipeline now ends 07 → 08). Tested all four kinds apply/re-apply/undo in a rolled-back transaction; no overrides exist yet.
- 09 now deletes admin rows on service parts before deleting those parts (FK).


### 2026-10-24 (vendor data: terminology before inference)
- Laken granted `hdchop_ro` SELECT on catalog_oem_crossref, catalog_fitment_v2, product_fitment_year_model, vtwin_scrape_data, pu_fitment_expanded (Stinkin' DB). Undo: REVOKE the same five.
- Measured (read-only): vendor rows link ~1,330 Panhead / 750 Knucklehead / 1,000 Flathead H-D numbers not in hdchop; WPS is almost all 1985+ (adds little for vintage).
- Found: Stinkin's derived tables (`product_fitment_year_model.family_name`, `catalog_fitment_v2`) mis-expand codes (FL = Touring from 1930, FX from 1941, FXS 1977–84 = Softail, FLT from 1939). Use raw vendor text only.
- Added (nothing applied): docs/HD_TERMINOLOGY.md (eras, chassis families, vendor family tokens by year, bad mappings, suspect vehicles, open questions); scripts/etl/lib/vendorterms.mjs (resolver: model / family / review / skip / reject; never creates vehicles); scripts/etl/10_vendor_terms_check.mjs (read-only check on vtwin fitment_raw → reports/10_vendor_terms_<ts>.txt). Result: 32,154 segments → 16,687 family, 5,356 model, 3,786 review, 185 skip/reject.
- Suspect existing vehicles (not changed): FXWG 1986 and FXSB 1986 filed as softail (FXSB named "BREAKOUT"); FXEF filed fxr; FXWG/FXSB 1985 missing. They leak into "FX Softail" expansions.
- Next: Laken answers HD_TERMINOLOGY open questions → fix suspect vehicles → decide vintage vehicle source (FL 1941–84 PDF catalog or reviewed seed) → DATA_RIGHTS vendor rule → vendor fitment ETL dry run.

### 2026-10-24 (FL/FX chassis families; problem rows fixed)
- Laken: FL includes FLH; EL = Knucklehead (61 ci); FXR its own family/frame; W/WLA own models; FL/FX get their own families.
- Applied 005 (platforms `fl`, `fx`); 01 chassisPlatform + range evidence reads ";" cells and single years. Live: FXWG/FXSB 1986 softail → fx (FXSB "BREAKOUT" dropped), FXEF fxr → fx, FX family 1971–84 vintage → fx, FLH/FLHS 1984 touring → fl; added FXWG 1985, FXSB 1985, FXDG 1983 (Disc Glide). Re-ran 01 → 03 → 04 → 09 → 05 → 06 → 07 → 08 (fitment 769,997 oem_catalog; service 659,122; inferred 12,811). Checked /v1/models 1983–86 and the app's 1985 picker.
- CLAUDE.md FL/FX rule rewritten (year-dependent); HD_TERMINOLOGY.md updated; vendorterms uses fl/fx platforms; mobile labels for fl/fx/fxr/vintage (fixed v_rod key).
- Thin: 1985–86 FX bikes have 70–122 fitment rows (1984–86 FX-FXST catalog partly extracted); 1984 FLH/FLHS and 1983 FXDG have 0. Laken has the early PDF catalogs → next: build a PDF reader for them (also settles 1982 FXSB, 1985 FLH frame, Knuckle/Pan vehicles).

### 2026-10-24 (catalog OCR reader, dry run)
- Added scripts/catalog/{books,ocr,parse}.mjs + scripts/etl/11_catalog_books.mjs (dry run only) and docs/CATALOG_READER.md. OCR cache ~/Developer/catalog-ocr (outside repo). lib/usedon.mjs exports splitUsedOn (01 uses it).
- OCR'd: 1984-86 FX-FXST, 1984-86 FXR, 1941-84 FL (Laken downloaded), 1950 45ci, 1942 WLA. Clean rows: 92% / 91% / 32% / 56% / 79%. Report reports/11_catalog_books_20261024_141404.txt.
- Nothing loaded. Decisions: FL-book "Classic" code (1,772 rows), vintage vehicles need a model-year source beyond catalog text ("41 to * - FL, FLH"), FXAT/FXRAT/FXAD/FXRAD codes.
- Found: lib/usedon.mjs reads "84 & 86" as a range (affects 01 evidence and 03 fitment wherever "&" joins non-consecutive years); catalog parser handles it, shared parser not changed yet.
- JW Boon vendor PDFs (~/Downloads vl/wl/panhead/bigtwin.pdf, text layer) + Laken's jwboon scrape: next, under the vendor rule (part numbers carry a vendor letter prefix).
- Decided (Laken): FL-book "Classic" = FLHC 1979–84 (FLH Classic, Shovel Electra Glide Classic), platform fl; FLHC 2018+ stays Softail. books.mjs yearCode; Classic drops out of code lists before 1979. FL book now 63% clean (was 32%). Report reports/11_catalog_books_20261024_143527.txt. Still dry run only.
- Added books (Downloads): 1954-78 XLH/XLCH (82% clean, 42,493 pairs) and 1966-84 Shovelhead engine 99427-84 (99% clean, new `appl` column layout; "Big Twins" = that year's Shovelhead big twins; 80ci/74ci kept as condition). `printed` year per book for the part-suffix check.
- Found: Sportster vehicles wrong — `XL` 1957-85 generic, `XLH` only 1976/78/84/85, `XLS` only 1984-85. Needs an 01 rule (XLH/XLCH from 1958, XLS from 1979) with catalog evidence; not changed.
- Desktop scan: hd_parts_data_final.csv (1.26M rows, 1979-2012 year+model+part; origin unknown, needs DATA_RIGHTS); data:catalog1 48-53/49-60/61-80.pdf ~850 MB each iCloud-only, not downloaded (4.5 GB free); JW Boon CSV (74k rows) and Eastern 2022-24 catalog = vendor.

### 2026-10-24 (Ironhead Sportster vehicles, dry run)
- Finding: in the 1954-78 XLH/XLCH book "XL" is the 1957 model, then the XLH (1977-78 rows say "XL, XLCH" and "XLH, XLCH" for the same kinds of parts).
- 01_vehicles: XL_BOOK evidence (XLH/XLCH 1958-78), XL kept for 1957 only (others → review `xl_family_label`, deleted with their fitment on --apply), XLH name empty before 1972; new "Diff vs vehicles table" report section (added / changed / retired). lib/fitment.mjs + books.mjs map the book's XL 1958-78 → XLH. 11_catalog_books takes --vehicles-from.
- Dry run: 01 +19 XLH (1958-75, 1977), 0 changed, -28 XL 1958-85 (7,557 fitment rows). 03 preview: 445-661 rows per new XLH year. XL book pairs 42,493 → 64,063. Reports reports/01_vehicles_20261024_164932.*, 03_fitment_20261024_164943.txt, out_11.txt.
- APPLIED (Laken approved): 01 --apply (+19 XLH, -28 XL, 7,557 fitment rows deleted) → 03 → 04 → 09 → 05 → 06 → 07 --max-hole 3 → 08 (refreshes fitment_spans). Live: XLH 1958-78 has 452-678 rows/year, XL 1957 421, XLCH unchanged; fitment 1,442,207 (oem_catalog 770,274; inferred_span 12,811); fitment_spans 407,587. /v1/models?year=1965 shows XLCH + XLH. Note: 07 must get --max-hole 3 (default bridges all holes: 36,855 rows); first run here forgot it, rerun fixed.
- Apply order when approved: 01 --apply → 03 → 04 → 09 → 05 → 06 → 07 → 08, refresh fitment_spans.
- Still missing: XLH 1979-83, XLS 1979-82 (need 1979-85 Sportster catalog). Parser artifact seen: "70 - KH, XL, XLH, XLCH" rows (KH can't be 1970; likely misread "54 to *").
- Laken asked for engine size (ci) and transmission (4/5/6-speed) per bike. Source DB has only engine-era ranges (hd_engine_types). Catalogs document both: transmission sections ("TRANSMISSION HOUSING — 5 SPEED") with used-on codes, Shovel engine book 1340/1200. Not started.

### 2026-10-24 (vehicle specs: engine size + transmission, dry run)
- Laken shared Drive PDFs (owner lowbrowfiles@gmail.com): Shovelhead-Engine-_-Model-Information.pdf (= 99427-84, same doc as ~/Downloads/99427-84.pdf), FL-FX-1961-1976-Parts-Book (9.6 MB), HD-Parts-Catalog-99455-83C-FX-Models-1971-1984 (8.3 MB). Last two not downloaded yet (need Laken's OK).
- Transcribed H-D's "Shovelhead Model History" table (99427-84 printed p11-12) from the page images into scripts/catalog/specs/shovelhead_model_history.mjs (model, years, 74/80 ci, 4/5-speed, notes).
- Added scripts/etl/12_vehicle_specs.mjs (dry run; no target table yet, --apply refused). Result reports/12_vehicle_specs_20261024_172702.txt: 44 vehicles get specs (35 4-speed, 6 5-speed; 4 with two displacements that year: FXE 1981/83/84, FXS 1979½). 60 table code-years have no vehicle (FL/FLH 1966-83, FLHC, FLT, FLHT, FXEF 1978-80, FXE 1982).
- Table vs vehicles disagreements (not changed): FX 1978-84 in vehicles but table ends FX 1977; FXE 1973 (table starts 1974); FXS 1983-84 (table ends 1982, FXSB takes over 1983); FXSB 1982 (table starts 1983); FXEF 1984. The 99455-83C FX catalog should settle these.
- Next: migration for a specs table (vehicle_id, displacement ci/cc, transmission speeds, source, note; multiple options per vehicle), then more spec sources (FX-FXST/FXR 1984-86 transmission sections, later service catalogs for 6-speed).

### 2026-10-24 (Drive catalogs: OCR + dry run)
- Downloaded (Laken's go) to ~/Downloads/hd-drive: FL-FX 1961-76 parts book, 99455-83C FX 1971-84, 99484-69 Sportster 1959-69 service manual, 1970 XR/XLR. Skipped 99451-78A (same book as the 1954-78 XL we have). OCR'd all (~780 pages).
- books.mjs: 4 new books (`manual` layout skipped by 11). parse.mjs: stray mark before name, wrapped used-on, "t0"→"to" before finding the used-on, "AN Models", "All Models except …" (11 honors `except`). FX book code repairs; XR → XR750 (1970).
- Dry run reports/11_catalog_books_20261024_174518.txt: FX 1971-84 77% clean, 60,834 pairs (38,617 new); 1961-76 FL-FX 16% (poor scan); XR 393 pairs on XR750 1970; older books all improved.
- Specs: scripts/catalog/specs/ironhead_1959_69_service.mjs (99484-69 p1A-3: 883 cc / 53.9 ci, 4-speed, XLH/XLCH 55 hp, 9.0:1). 12_vehicle_specs now 66 vehicles (57 4-speed, 6 5-speed), also horsepower + compression. reports/12_vehicle_specs_20261024_174622.txt. Still no specs table (needs migration).
- Nothing loaded; nothing committed.

### 2026-10-24 (vehicle_specs live)
- Added packages/db/migrations/006_vehicle_specs.sql (one row per option a source states: ci, cc, transmission speeds, hp, compression, mid_year_change, note, source + source_ref; UNIQUE NULLS NOT DISTINCT (vehicle_id, source, ci, speeds); ON DELETE CASCADE). Tested in a rolled-back transaction, then applied (Laken approved). hdchop_api has SELECT via default privileges (checked).
- 12_vehicle_specs --apply: replaces rows of its own sources only. Live: 70 rows, 66 vehicles (99427-84 model history 48, 99484-69 1A-3 22); 7 rows with no transmission stated (FXE 80, FXS 80 rows print none). Re-run is idempotent.
- Not done: API/app don't read vehicle_specs yet (bike page "80 ci / 1340 cc · 4-speed").
- Specs in the app: /v1/models returns `specs` per model (json_agg of vehicle_specs); mobile Bike carries them, YOUR BIKE screen (search.tsx) shows "53.9 ci (883 cc) · 4‑speed", hp/compression when printed, and "Sold with either engine this year" / "Engine changed mid-year" for two options. Checked in the browser at phone width against a local API (1965 XLH, 1981 FXE, 1981 FX without specs), then deployed API (hd-chop-api:d60e6d5-dirty, healthy) and checked /v1/models?year=1981 live. Added launch config `mobile-web-local-api` (web app on :8083 against the local API). SPEC.md API row updated.

### 2026-10-24 (vintage bikes, dry run)
- Laken: Panhead 1948-65, Shovelhead 1966-84.
- Picker years for vintage codes are padded/wrong (VL 1938-47, FL 1936-40, EL 1951-56); catalog code lists ("41 to * - FL, FLH") name whichever existed; the 1950 45ci book's "Solo" covers every solo code every year. None of these set model-years.
- 01_vehicles DOC_YEARS: model-years from documents that state them: 99427-84 Shovelhead Model History (FL 1966-80, FLH 1966-84, FLHS, FLHC 1979-84, FLT, FLTC, FLHT/FLHTC, FLHF, FX family), TM 10-1482 WLA columns (1940-42), FL catalog single-model rows (FL 1948-65: 5-7 rows/yr 1953-65 but one row 1948-52; FLH from 1955: 8-11 rows/yr). May add codes the picker lacks that year (FLHC 1979-84). Era-family names only inside the era (no "PANHEAD HIGH COMPRESSION" on 1978 FLH). OVERLAP 1984 fl = shovelhead.
- Dry run reports/01_vehicles_20261024_184144.*: +87 (FL 1948-80, FLH 1955-83, FLHC 1979-84, FLHF, FLHS, FLT, FLTC, FLHT, FLHTC, FXEF 1978-80, FXE 1982, WLA 1940-42), changed 2 (1984 FLH/FLHS engine -> shovelhead), retired 0. NOT applied.
- 03 preview: FL/FLH/FLHC/WLA get 0 rows from hd_oem_catalog_reference (Stinkin' never extracted those books); FXEF/FXE 350-380/yr. 11 preview vs proposed bikes: FL book 92,926 pairs, Shovel engine 18,045, WLA 1,933, 1961-76 3,307. So vintage bikes need the catalog_ocr load path (11 --apply) to show parts.
- Still no source: EL 1948-52, Knucklehead (EL/FL 1936-47), FLF/FLHF/FLE/FLP/FLHP pan variants, flatheads besides WLA. Candidates: iCloud data:catalog1 48-53 / 49-60 PDFs (~850 MB each, not downloaded).

### 2026-10-24 (catalog_ocr loader, dry run)
- 11_catalog_books --apply built: migration 007 (oem_parts.source += catalog_ocr), clean rows only, pairs no other source has (any conditions), medium/low, 80ci/74ci from the Shovel engine book (condition_source catalog_text; no condition_tags rows), new parts with a short cleaned name (cut at OCR junk words). XL-book rows with "YY - KH" after 1956 go to review (misread "54 to *").
- 03 and 09 --apply now also clear catalog_ocr fitment (09 also catalog_ocr parts) so their inserts can't collide; order 01 → 03 → 04 → 09 → 11 → 05 → 06 → 07 --max-hole 3 → 08, then 12 --apply (new FL bikes get specs).
- Dry run vs proposed bikes (reports/11_catalog_books_20261024_184547.txt): 175,225 rows (FL book 62,465; FX 1971-84 34,989; XL 26,854; 45ci 16,855; Shovel engine 12,294 incl. 135 74/80ci; 1984-86 FX-FXST 9,602 / FXR 7,546; 1961-76 2,404; WLA 1,846; XR 370); 74,729 on the 87 new bikes; 5,650 new part numbers (3,880 named). DATA_RIGHTS row added for catalog_ocr (same terms as the H-D catalog rows). Nothing applied.

### 2026-10-24 (vintage bikes + catalog_ocr APPLIED)
- Laken approved. Applied migration 007; 01 --apply (+87 bikes, 1984 FLH/FLHS engine -> shovelhead); 03 (774,590) → 04 → 09 (659,122 service; 20,913 parts) → 11 (5,650 parts, 173,895 catalog_ocr rows) → 05 → 06 (concepts on 10,952 parts) → 07 --max-hole 3 (12,811) → 08 (fitment_spans refreshed); 12 --apply: 130 spec rows on 121 bikes (all Shovelhead-table code-years now matched).
- Live /v1/models: 1950 FL/G/WL; 1962 FL/FLH; 1978 FL 74ci, FLH 74/80ci, FXEF; 1983 FLHC/FLHF/FLT/FLHT/FLHTC 80ci; 1941 WLA.
- Gap found: vintage searches are thin. 1962 FLH has 802 parts, 16 with a concept: catalog_ocr parts got concepts on 357 of 5,650 (06 seed terms are modern wording; old names like "Cap, fuel tank", "Tank, gasoline"). The FL book's tank pages list trim/nameplates, no tank shells read clean. Next: concept seed terms for vintage wording.
- ratbikeservice.com parts-catalog index (37 books) checked: worth getting 1987-90 All 1340cc, 1986-90 XLH (Evo Sportsters have 0 parts), 1972-89 XR750, 1941-78 FL/FX, 1971-80 FX, 1980 FXWG-80 supplement (~56 MB). No 1979-85 Sportster (99781-85), no 1948-60, no Knucklehead there. Not downloaded (needs Laken's OK).

### 2026-10-24 (ratbikeservice books, dry run)
- OCR'd 6 books (~/Downloads/hd-ratbike). 1941-78 FL/FX reads from the PDF text layer (books.mjs textLayer; our OCR of its faint images failed). parse: "All Models" + dot-leader junk ("All Models ." / "_" / "oo"), "to •" = "to *".
- Clean: 1986-90 XLH 81% (15,765 rows on Evo Sportsters, 0 parts today), 1941-78 FL/FX 76% (35,868 new after the other books), 1980 FXWG supp 81%. Not usable yet: 1987-90 All 1340cc (three model columns FLT/FXR/Softail with VIN-code cells "87*-BJ/M": needs its own layout + 1987-90 VIN table), 1971-80 FX (poor scan), 1972-89 XR750 (rows print no used-on).
- Full dry run (reports/11_catalog_books_* latest): no book got worse; catalog_ocr would go 173,895 -> 225,437 rows, 5,650 -> 6,596 parts. Not applied (Laken's item 2).
- APPLIED (Laken): 11 --apply (catalog_ocr 225,437 rows, 6,596 parts) → 05 → 06 (concepts on 11,060 parts) → 07 --max-hole 3 (12,811) → 08 (fitment_spans refreshed). Live: 1987-90 XLH883/1100/1200/883DLX/883HUG have parts (1988 XLH883 "brake pads" → 44063-83A). Generic XL883 1986-90 still 0 parts (same family-label issue as Ironhead XL; not changed).

### 2026-10-24 (Evo Sportster vehicles, dry run)
- 1986-90 XLH catalog p2 V.I.N. table (H-D, (c) 1989): 1986 XLH883, 883 Deluxe, 1100; 1987 + 883 Hugger; 1988-90 XLH883, 1200, 883 Hugger, 883 Deluxe. 01: EVO_XL_TABLE as DOC_YEARS; Sportster codes outside it for 1986-90 -> review `not_in_xlh_vin_table`, retired on --apply (generic XLH kept: 1990 XLH has 912 oem_catalog rows). docFamily: XL* -> Sportster.
- Dry run: +3 (XLH883DLX 1986-87, XLH883HUG 1987; ~2,946 catalog rows), retire 6 (XL883 1986-90, XLX 1986; 0 fitment each). XL883 1991+ kept (H-D 1991-92 single-year books name it). Not applied.
- APPLIED (Laken): 01 (+3, -6, 0 fitment lost) → 11 (catalog_ocr 228,383 rows, 6,596 parts) → 05 → 06 → 07 --max-hole 3 → 08. Live picker 1986-90 = the VIN table exactly, all with parts.
- Found: 1991+ XLH883/XLH1200/XLH883DLX/XLH883HUG have 0 parts (the 1991+ H-D books name XL883 etc.); likely retire or alias like 1986-90. Not changed.

### 2026-10-24 (1991+ Sportster XLH -> XL codes, dry run)
- Measured 1991-2004: every XLH* Sportster vehicle had 0 fitment and 0 single-year book mentions; the H-D books (service portal + reference) name XL883, XL883HUG, XL883DLX, XL1200, XL1200C, XL883C instead (3-770 mentions/yr).
- 01: from 1991 an XLH code becomes its XL twin (picker name kept), twin needs its own evidence; old XLH key reviewed `xlh_renamed_to_xl` and retired on --apply; plain XLH -> XL (family label, rejected).
- Dry run reports/01_vehicles_20261024_203402.*: +32 (XL1200 1991-2003, XL883DLX 1991-96, XL883HUG 1991-2003), -92 (XLH, XLH1200, XLH1200C, XLH883, XLH883C, XLH883DLX, XLH883HUG from 1991; 0 fitment). 03 preview: 150-330 rows/yr on the new bikes before 09 adds the service-catalog rows. Not applied.
- APPLIED (Laken): 01 (+32, -92, 0 fitment lost) → 03 (782,637) → 04 → 09 (685,202 service rows, 21,009 parts) → 11 (228,402 catalog_ocr) → 05 → 06 (11,077 parts with concepts) → 07 --max-hole 3 (12,811) → 08. Live: 1991/1996/2003 Sportster pickers list only XL codes, all with parts; new XL1200/XL883DLX/XL883HUG 973-1,139 rows per bike.
- Correction (Laken): Desktop/data:catalog1 48-53.pdf / 49-60.pdf / 61-80.pdf are NOT parts catalogs. Dropped as a source. EL 1948-53, Panhead variants (FLF/FLHF/FLE/FLP/FLHP), Knucklehead still need a source.

### 2026-10-24 (vintage search wording, dry run)
- data/seed/concepts_seed.csv: fuel_cap += "tank cap"; sprocket_rear += "wheel sprocket"; wheel_front/rear += "front/rear cast wheel"; grip += "grips"; new concepts piston ("piston", "piston and rings"; excl pin, lock ring, tensioner), piston_rings ("piston ring", "rings piston"), chain ("chain"; excl link, guard, oiler, adjuster, tensioner, cover, balancer, cam). False hits checked and removed (oil filler cap, chain-tensioner piston, balancer chain).
- Old-vs-new on all parts: +322 parts get a concept, 0 moved, 0 lost. Bikes: 1950 FL 13->17 parts with concepts; 1962 FLH 36->56; 1965 XLH 31->59; 1978 FLH 109->136; 2004 FLHR 95->104.
- Still thin: most vintage parts are internal engine parts with no rider concept; 1941 WLA has names on 129 of 599 parts (wla layout reads names poorly). Bigger lever next: use the OCR'd catalog section titles ("GAS TANK", "FRONT FORK") like SECTION_RULES. Not applied (06 --apply then 08).
- Applied wording above (06 --apply, 08): concepts on 11,399 parts. Live 1962 FLH: "gas cap" -> 61103-36, "chain" -> 40007-36A.
- Section-title concepts (OCR catalog section + bare item name) previewed: only 119 parts, noisy (fender braces/tips, seat plunger, front lamp in tail-lamp section). Not built. The good hits were wording misses instead: fuel_tank += "gas tank|gasoline tank"; tail_lamp += "taillamp|taillamp lens|tail lamp lens"; speedometer += "speedometer head"; headlamp += "sealed beam|sealed beam unit" (excl passing|spot|fog). Dry run: +48 parts, 0 moved. Not applied.
- Limit: vintage parts are mostly internal engine parts, and many OCR names are missing (1941 WLA 129 of 599 named).

### 2026-10-24 (FX year conflict, dry run)
- 1971-84 FX catalog single-year rows: FX alone through 1978 ("78 - FX", "Late 78 - FX" harness), "Early 79 - FX, FXE..." rows; nothing for 1980+ but one "Early 81" and one "Early 84" long list. FXE 1973 ("73 - FX, FXE"), FXS 1983 ("Late 82 & 83 - FXS-80"), FXSB 1982 (4 rows "82 & 83 - FXWG, FXE-80, FXSB"), FXEF 1984 (1984-86 book "84 & 85 - FXSB, FXEF") all named by the catalog: kept, against the Shovelhead table.
- 01 FX_NOT_BUILT: FX 1980-84, FXS 1984 (one crankcase row also listing FXB) -> review `fx_not_built`, retired on --apply. 6,277 fitment rows on them; only 5-6 parts/yr fit no other fx bike, all from the Shovel engine book's "FX".
- books.mjs: engine book "FX" -> '*FXFAM*' = that year's Shovel fx-platform bikes (11 fxFamily), so those parts move to FXE/FXS/FXWG/FXB/FXSB/FXEF/FXDG.
- Dry run: 0 added, 0 changed, 6 retired. Not applied. Apply order: 01 → 11 → 05 → 06 → 07 --max-hole 3 → 08.
- APPLIED (Laken): 01 (-6 bikes, 6,277 rows) → 11 (catalog_ocr 224,628; +189 engine-book rows moved onto real FX-family bikes) → 05 → 06 → 07 --max-hole 3 → 08. Live: 1979 FX/FXE/FXEF/FXS; 1982 FXB/FXE/FXEF/FXS/FXSB/FXWG; 1984 FXE/FXEF/FXSB/FXWG.

### 2026-10-24 (H-D "Component Types and Introduction Dates", measured)
- Laken pointed at the service-portal section "Component Types and Introduction Dates". It is in all 391 scraped books (~/Developer/catalog-extract/html), not in the rows/*.tsv extract. Parsed (scratch): 511,478 rows, 881 H-D component types (e.g. 610A1 Fuel Tank, 678A1 Taillight, 520A1 Rider Seat), 49,162 part numbers; intro year per part (or Unknown).
- Coverage: 41,906 of our 54,065 parts have a type, 40,422 an intro year; 31,713 typed parts have no concept.
- Draft map of ~70 main-item types -> concepts (fill gaps only): +4,095 parts with a concept (89,947 fitment rows); where a concept already exists the type agrees 7,174 times, disagrees 131 (98%). Nothing built yet.
- Proposed: migration 008 part_component_types (oem_number, type_code, type_name, intro_year, books); step 13 loads it from the HTML; seed data/seed/component_type_concepts.csv (code -> slug); 06 fills concept gaps from it and reports disagreements; admin shows type + intro year. Same DATA_RIGHTS status as the service-portal rows (facts; ToS question open).
- Built (dry run): migration 008 part_component_types; scripts/etl/lib/componenttypes.mjs (reads the section from catalog-extract/html); scripts/etl/13_component_types.mjs (dry run + --apply); data/seed/component_type_concepts.csv (74 type codes -> concepts, main items only); 06 gap fill from types (never overrides a name match; disagreements in the report); lib/concepts readTypeMap.
- Dry run reports/13_component_types_*: 391 books, 511,478 rows, 49,162 parts (47,379 with intro year, 16 with >1 type), 881 codes. Gap fill +4,097 parts / 89,854 fitment rows; agree 7,177, disagree 131 (piston vs rings, inner vs outer fairing, ...). Some type names truncated at 20 chars in every book (cosmetic). Apply order: migration 008 → 13 --apply → 06 --apply → 08.
- APPLIED (Laken): migration 008; 13 --apply (49,162 rows; fixed null other_types); 06 --apply (concepts on 15,544 parts, +4,097 from types; 131 name matches kept over a different type); 08. Live: 1995 FLHTC "speedometer" 10 parts, 1999 FLSTF "ignition switch" 71313-96A.
- Found (Laken's 1984-86 FLT link): the portal list (catalog-extract/catalogs.json) has 14 pre-1991 catalogs the scraper skipped as PDF-only, incl. 1979-1985 XL (99781-85, the missing Sportster book), 1980-83 FLT, 1984-86 FLT (2 editions), 1977 XLCR, 1984.5-90 FXRP/FLHTP, 1972-2008 XR750, 1987-90 1340cc. Not downloaded.
- Also: the service-portal books' "(replaces NNNNN-YY)" notes (catalog-extract/out/replaces_notes.csv, 620 lines) aren't read by 05 (it only reads hd_oem_catalog_reference). Possible supersession follow-up.

### 2026-10-24 (portal pre-1991 PDFs: fetcher + 'vin' layout)
- ~/Developer/catalog-extract/fetch_pdfs.mjs (outside repo, next to the scraper): opens each pre-1991 catalog on the portal, fetches every table-of-contents section PDF from inside the viewer (viewToken), joins with pdfunite -> catalog-extract/pdf/<slug>.pdf. Uses installed Chrome (Playwright browser build was missing). Polite pauses. 14 books running in the background (fetch_pdfs.log).
- 2021 reissues have a clean text layer; MODEL(S) = model-identification code + year ("DB85 (late) DD86 DJ86") with a legend at each page foot. parse.mjs layout 'vin' + books.mjs `legend` per code-year (read off the page image; DD = FLHTC 84-85 but FLHT 86; sidecar rigs null).
- 1984-86 FLT (99438-86B): 99.2% clean, 12,686 new pairs for FLTC/FLHTC/FLHT 1984-86, 550 new numbers. Dry run only.
- scripts/dev/notes.mjs (open admin notes + recent overrides) and CLAUDE.md read-first step 5. Laken's note #2 (45946-71 "lider") was already fixed by Laken (rename override #1, note done).
- Admin part page shows H-D type + intro year (part_component_types).
- 05_supersession also reads "(use/replaces ...)" notes from the service-portal catalogs: dry run 162 -> 359 accepted pairs (279 pairs only the portal gives), 283 chain_root changes, review 401 (name_mismatch 190). NOT applied: next 05 --apply will include them.
- parse.mjs 'vin' layout + books.mjs 1984-86-flt (dry run 99.2%). Fetch progress: 7 of 14 PDFs down incl. 1979-85 Sportster.
- 1979-85 XL (99451-85A) book: layout hd + textLayer, XL/XLHA -> XLH, XLSA -> XLS, "XR-1000" -> XR1000, parser reads "79 and 80" as "&". Dry run 96.9% clean, 16,987 new rows (9,059 on new bikes). 01 DOC_YEARS: XLH 1979-83, XLS 1979-82 (single-year rows every year; XLCH stays 1979: "79 and 80-XL, XLCH, XLS" lists only). 01 dry run +9 bikes. Not applied.
- Fetch: 9 of 14 down (also 1980-83 FLT, 1984-86 FLT 2nd edition, 1986-90 XLH, 1941-84 FL, 1984.5-90 FXRP/FLHTP).
- APPLIED (Laken): 01 (+9: XLH 1979-83, XLS 1979-82) → 11 (catalog_ocr 251,870 rows, 7,711 parts; incl. 1984-86 FLT + 1979-85 XL) → 05 (359 supersession pairs incl. portal notes; chain_root changed on 163 parts) → 06 (15,790 parts with concepts) → 07 --max-hole 3 → 08. Live: 1980/1982 XLH + XLS, 1985 XLH/XLS/XLX/XR1000 all with parts; 1981 XLH "gas tank" -> 61097-79.
- Fetch done: 10 of 14 saved; 4 failed "viewer never loaded" (1987-90 1340cc, 1971-84 FX, 1972-2008 XR750, 1966-84 Shovel engine; short portal ids, served differently). Portal 1941-84 FL and 1986-90 XLH are the same old scans we have.
- Added to books.mjs (text extracted, NOT dry-run/loaded yet): 1982-83-fxr (vin; EA=FXR, EB=FXRS, EC83=FXRT; file saved as 1984-1986-touring.pdf), 1977-78-xlcr (vin; FH77/78=XLCR), 1980-83-flt (hd; Classic=FLTC), 1984-90-police (hd; FXRP, FLHTP), 1984-86-fxr-portal (cleaner copy of 1984-86-fxr; compare before switching).
- Dry run of the new portal books: 1982-83 FXR 98.7% (5,998 rows), 1977-78 XLCR 99.5% (1,192), 1980-83 FLT 98.8% after Classic/"CLAS-" -> FLTC and TLE -> skip (7,021), 1984.5-90 police 95.0% after FLHPT/FLTHP -> FLHTP and CLE/TLE/RLE -> skip (9,015). Portal 1984-86 FXR read 84.6% vs our OCR 93%: dropped. Not loaded. Open: FLHTP 1985-90 police bikes (book is evidence; no vehicles), FLTC 1980-81/83 (Shovel table says FLTC 1982 only).
- APPLIED (Laken): 11 (catalog_ocr 273,085 rows, 8,520 parts; + 1982-83 FXR, 1977-78 XLCR, 1980-83 FLT, 1984.5-90 police) → 05 → 06 → 07 --max-hole 3 → 08. Live: 1977 XLCR seat, 1982 FXRS headlight, 1981 FLT windshield, 1988 FXRP handlebar all return parts. Check later: 44141-77 under XLCR "seat" (looks like a brake number).
- 4 failed portal books (XR750 5700, FX 5701, Shovel engine 5703, 1340cc 2177894170260438723) are "original document" downloads: /api/documents/original/downloadUrl/<id> -> 401 (needs a portal login). Not worked around. We have PDFs of three; only the 1972-2008 XR750 is lost.
- 01 DOC_YEARS: FLHTP 1984-90 (1984.5-90 FXRP/FLHTP book: title + sole-code rows every year). Dry run +7 bikes, ~9,400 police-book rows on them. Not applied.
- Seat concept: excluded hose / spring-upper / spring-lower / bearing / ... (removes 44141-77 "Seat, brake hose", 54541-77 / 54542-77 spring seats; nothing else changes). Not applied (06).
- APPLIED (Laken): 01 (+7 FLHTP 1984-90) → 11 (catalog_ocr 282,484 rows, 8,612 parts) → 05 → 06 (16,011 parts with concepts; seat fix) → 07 --max-hole 3 → 08. Live: 1987 FLHTP + FXRP with parts; 1977 XLCR "seat" no longer returns brake-hose/spring seats (returns none: the XLCR seat isn't named "seat" in its book).
- Not usable here: 1941-84 FL copies on the portal (5704) and bikers-store.fr are the same scan (Acrobat text layer 35.7% vs our OCR 66.6%). hydra-glide.net (Panhead/Flathead OEM lists with used-on years) is behind a Cloudflare bot check: not scraped; needs Laken to pass it in the browser pane, a DATA_RIGHTS decision, ideally the owner's permission.

### 2026-10-25 (hydra-glide.net OEM lists, dry run)
- Laken scraped hydra-glide.net into ~/Downloads/hydra_glide_oem_parts.csv (12,631 rows: old_pn, oem_pn, description, used_on, replaced_by, parent_kit); copied to ~/Developer/catalog-extract/hydra/. Not in the source DB. DATA_RIGHTS row added (approved by Laken; site terms unknown, revisit before launch).
- 05 reads it: old (pre-1972 short_base) -> new number and replaced_by (lib/csv.mjs). Dry run: 4,763 links, accepted pairs 359 -> 3,506 (cycles 78 to review); chains stay short until 14 adds the missing numbers.
- 14_hydra_glide.mjs (new) + migration 009 (oem_parts.source += hydra_glide): used_on "years -- group" -> existing bikes (FL/FLH, OHV, side valves -> U/UL/UH/ULH/V*, Servi-car -> G, W/45" -> WL/WLA, Panhead -> FL/FLH, explicit codes; inch sizes not years; codes before or after the years). Dry run: 132,931 pairs on existing bikes, 34,281 already from H-D sources, NEW 84,869; 7,199 new part numbers (6,538 named). Review 4,566 segments (bare years, all models/all twins, solo, radio).
- 03/09 also clear hydra_glide rows; order 01 → 03 → 04 → 09 → 11 → 14 → 05 → 06 → 07 → 08. Nothing applied.
- APPLIED (Laken): migration 009; 14 (7,199 parts, 84,869 hydra_glide fitment rows) → 05 (3,150 supersession pairs; chain_root changed on 1,849 parts) → 06 (16,419 parts with concepts) → 07 --max-hole 3 → 08. Live: 1940 UL "piston" 7 parts, 1955 FLH "seat" 4, 1947 WL "chain" 40006-29. Still empty: 1962 FLH "gas tank", 1938 U "muffler", 1950 G "brake shoes" (concept gaps on vintage names).

### 2026-10-25 (model families: accordion on fitment lists)
- Laken's rule: group by model code. FLHR* = Road King, FLHT* = Electra Glide incl. Ultras/Ultra Limited; Heritage and Fat Boy separate. apps/api/lib/familyRule.ts (pure, from vehicles): code goes under the shortest 4+ char code on its platform it starts with; off touring/trike a code whose cleaned name breaks from its parent's starts its own family (FLSTF Fat Boy vs FLST Heritage); families whose name starts with another's merge (FLHP -> Road King, FLSTF + FLFB, XLH1200 + XL1200). No hand list, no overrides. Platform per span = vehicles at (code, year_end).
- API: every span on /v1/part and /v1/search gains family + family_key (lib/families.ts, map cached per process; additive). Deployed.
- Mobile: part screen folds 2+ codes of one family into a collapsible row (opens by default when it holds the rider's model); PartCard "Also fits Road King ×5 1996–2006 · ...". titleCase keeps FXR/FXDR upper. Checked at phone width on 59786-01 (59 rows -> 4 families) and 40037-79A.
- Possible follow-up: family titles don't say the platform (a part fitting FXR + Softail can show two "Low Rider" rows).

### 2026-10-25 (specs 1991-current from the portal books, dry run)
- Laken: specs only covered 1959-84. Source: the VIN breakdown at the front of every portal parts catalog (position 4 "Engine type": "4=Twin Cam 96, 1584 cc", "M=883cc", "Y=Twin Cam 88B carbureted", "M=Milwaukee-Eight 114, 1868 cm3").
- scripts/etl/15_portal_specs.mjs (new): size = printed cc, else cubic inches in the engine name (Twin Cam / Milwaukee-Eight / Screamin' Eagle); one size per book -> all its models; several -> model code carrying the size (XL1200 ~ "1202 cm3", +-10 cc) or the models under that engine's sections. Evo big-twin books 1991-99 print no size: models with engine evolution_bigtwin under V2 Evolution sections get 80 ci / 1340 cc (source portal:<book>+hd_engine_types). Transmission only when a 6th gear is named (5th gears appear in 6-speed boxes too, so no 5-speed claims). Fuel not recorded (books list carb + EFI for one size).
- Dry run: 323 of 391 books give a size (68 without: Buell + a few), 1,163 of 1,436 1991+ vehicles get engine specs, transmission only 21 (6-speed). 0 Sportster 883/1200 mismatches. Gaps: 55 book models with several engines and no matching section (mostly 2021+), Buell. Not applied.

## 2026-10-25 — old-catalog wording gaps (throttle, tail lamp, handlebar) + 15 engine variants
- Laken: 1980 no throttle/idle cables; 1965 only tail lamp lens; no handlebars. Cause each time: parts were loaded but the concept never matched the old wording ("Control wire assembly", "Handlebar side, left", "Taillampassembly", "Lens, tail lamp 5").
- lib/concepts.mjs: trailing OCR junk dropped ("tail lamp 5"), "only" is filler, and a glued pass (matchGlued) for OCR-joined words ("Handlebarside", "Controlwireassembly"). Seed: throttle_cable + control wire assembly; handlebar + handlebar side; tail_lamp + housing/outlook/rearlamp/talllamp. 06 → 07 --max-hole 3 → 08 applied: concepts on 16,548 parts (+121, all reviewed).
- New read-only scripts/dev/concept_gaps.mjs: per concept + platform, the years with parts but none of the concept, with untagged candidates. 1,993 platform-years flagged; many are real (no belt drive or calipers before they existed); the rest are wording (fixable in the seed) or source holes.
- Source holes seen, not fixable by wording: 1958–72 FL/XL tail lamp body (only lens/door 68086-55 "Door, only"); 1965–69 XLCH bars (56087-63 fits 63-64 and 70-72 only); FL 1958–66 and XL 1957–65 fuel tanks.
- 15_portal_specs (still dry run): Twin Cam A/B by platform (B = Softail), Twin-/Air-/Center-/Precision-Cooled per model from cooling section titles, VVT / High Output kept; cooling word only where that year+engine had a choice. Needs migration 011 (engine column, unique incl. engine) + API/app/admin display before --apply.
- Second wording batch applied (06 → 07 --max-hole 3 → 08): +70 parts — split tanks "Left/Right tank" 1941-57, FXR "Tank assembly, prime", 1936-57 "Muffler rear end complete" / "Muffler & all fittings", "Seat pillion", "Headlight lens", "Taillight lens", "Lens, turn signal" (3 lenses moved off tail_lamp/headlamp). fuel_tank now excludes oil/coolant/overflow/reservoir/surge/vacuum/vent. Concepts on 16,615 parts.
- Vendor cross-reference by OEM number (internal check only, nothing copied): the read-only source role can read catalog_oem_crossref, vtwin_scrape_data, pu_fitment_expanded, hd_oem_catalog_reference, not pu_catalog / vtwin_catalog / catalog_products (names). Laken: those are his data; a GRANT SELECT would let 06 checks use them.
- hdchop_ro granted SELECT on pu_catalog, pu_products, pu_brand_enrichment, vtwin_catalog, catalog_products (Laken, on the server). Cross-reference by OEM number, internal only.
- set_concept overrides #2-7 from that cross-ref: 68086-55 "Door, only" + 68122-55 → tail_lamp (55-72 trim rim / lens gasket), 59093-87, 59924-80, 59129-86 "Fender" → front_fender, 68508-64 "Rear parking lamp" → turn_signal. 08 applied; live search verified (1965 FLH/XLCH tail lamp, 1988 FLTC / 1983 FXWG front fender, 1966 FLH turn signal). 68662-38 "Red lens" = spotlamp lens (no concept). 87900-34/-67A, 85040/85042-39 not in vendor data (likely sidecar), left alone.
- OCR part names: new scripts/dev/ocr_names.mjs (vocab = service_catalog + hydra_glide names + /usr/share/dict/words; drafts glued-word splits, trailing junk, one-edit spellings with no rival within two edits, asm/assy -> assembly; strict: every word in the draft must be a parts word). --apply added 1,057 rename_part overrides (reason 'ocr_names 20261025_144528'); 08 applied, live API verified (Transmission, Front cylinder head, Fork slider, Oil tank, Lens, tail lamp). Remove as a group: UPDATE admin_overrides SET active = false WHERE reason LIKE 'ocr_names %'.
- scripts/dev/name_review.mjs: names a person must read (rare unknown words, not dictionary, < 3 parts use the word; plus renamed-but-still-odd), sorted by bikes fitted, with a vendor-name hint by OEM number (internal only). 744 rows -> reports/name_review.csv for Laken. Fill new_name, then `node scripts/dev/name_review.mjs --import reports/name_review.csv [--apply]` + 08.
- Admin Tasks page (Laken asked for tasks to work on in the admin): migration 010_admin_tasks (applied), apps/admin /tasks (filters Yours / Claude's / Waiting for review / Done / All, edit form, Start / Mark done), nav link, "Your tasks" stat on the Counter. Any save sets review = 'pending'; scripts/dev/notes.mjs now lists those (answer in admin_tasks.reply, set review = 'reviewed'). Seeded 19 tasks (13 Laken, 6 Claude). The engine-name migration is now 011.
- Also: claude.ai "HD Chop Work Board" artifact (https://claude.ai/artifact/4UBupkZz9xaLxT1gyYZRiT) with the same items for the phone; the admin /tasks page is the one notes.mjs reads.
- Expo Go: the running expo start on :8081 serves exp://192.168.1.25:8081; QR at reports/expo-go-qr.svg (decoded OK).
- Models screen family grouping (f1de2bc): /v1/models adds family/family_key (familyOf in lib/families.ts, same rule as part spans); picker folds one named bike's codes into a collapsible row (Big gained `expanded`). API deployed (hd-chop-api:f1de2bc healthy); live check: 2015 = 39 models in 27 rows (Road King FLHP/FLHR/FLHRC, Electra Glide 5 codes...), 1980 FL/FLH/FLHS Electra Glide, FXE/FXEF Super Glide.
- Admin: task titles open their page (link = admin path or reports/ file via /files/<path>, read-only, reports/ only); Edit form has a Page field. New /review/names (reports/name_review.csv, 40 per page, inline Rename / Name is fine -> rename_part override reason 'name_review', applied at once; tested on 68034-77 -> "Lens, tail lamp", override #1065). /overrides filters ?kind= and ?reason= (prefix), 300 shown. Task links updated.

### 2026-10-25 (FIX_PLAN kickoff, A2 rate limit)
- docs/FIX_PLAN.md added (claude.ai review handoff). Seeded into admin_tasks as "FIX_PLAN <id>: ..." (#20-36; D3 = #14, C4 = #19 retitled, not duplicated). [Laken] items owner laken.
- Task #2 (names, Laken, doing) answered: 128 of 744 done via /review/names.
- A2: scripts/deploy/nginx-hdchop.conf (limit_req_zone 30r/m per IP, burst 20 nodelay, 429, on location /v1/) + scripts/deploy/check-ratelimit.sh. Live nginx config not readable from here (prod read denied), so the location block says to copy proxy_* lines from the existing `location /`. Baseline before the change: 50 x 200. NOT applied: Laken pastes it on the server, then re-run the check (expect ~21 x 200, rest 429).
- APPLIED (Laken, 2026-10-26 01:36 server time): scripts/deploy/apply-ratelimit.sh (backs up the site config to ~/hd-chop/nginx-hd-chop-api.bak.<ts>, writes conf.d/hdchop-ratelimit.conf, adds location /v1/, nginx -t, reload; restores on failure). Laken added /etc/sudoers.d/deploy-nginx (NOPASSWD nginx, reload, tee of the conf.d file, cp); the bare cp entry is broader than needed, narrow or remove it. Check: 50 fast requests -> 26 x 200, 24 x 429; years/models/search 200 after 10 s. Auto mode blocks Claude's ssh writes to the server, so server changes go through scripts Laken runs.

### 2026-10-26 (A3 app key + CORS, not deployed)
- apps/api/middleware.ts (Node runtime, /v1/*): X-App-Key must be in HDCHOP_APP_KEYS (comma list, read per request) -> else 401 {"error":"missing or invalid app key"}; no keys: 503 in production, open in dev. CORS only http://localhost:8081/:8083 and only when NODE_ENV != production (OPTIONS -> 204); '*' removed from lib/http.ts. No /healthz exists.
- next.config.ts also copies HDCHOP_APP_KEYS from the root .env for local dev; gate.mjs sends the first key; api.sh refuses to deploy without HDCHOP_APP_KEYS in api.env and health-checks with it.
- Mobile: api.ts sends EXPO_PUBLIC_APP_KEY. Key lives in gitignored root .env (HDCHOP_APP_KEYS) + apps/mobile/.env; eas.json profiles name EAS environments (production / preview), key set with `eas env:create` (README), not committed.
- Checked: standalone prod build on :3011 with test keys: no key/wrong/other key 401, both rotation keys 200, no CORS headers in prod, search body identical to live. Local dev: 401 without key, gate 0 errors (reports/gate_a3_local.txt), Expo web on :8083 at phone width: preflight 204, years/models/search load. NOT checked: Simulator, Expo Go on the phone.
- Gotcha: a first write of the key to the root .env silently didn't land and an "equal" check passed on two empty strings; now checked by length.
- Killed the old dev servers on 3001/3002/8081/8083 (Laken's OK).
- DEPLOYED A3 (Laken added HDCHOP_APP_KEYS to api.env): hd-chop-api:2a72485 healthy. Live: no key / wrong key 401, key 200, no CORS headers. gate.mjs now waits 2.1 s per request on non-local URLs (the A2 limit 429'd the unpaced gate); live gate identical to local, 0 errors (reports/gate_a3_live.txt). Phone/Expo Go needs `expo start -c` to pick up apps/mobile/.env; Simulator + Expo Go not checked.
- A3 Simulator check: Expo Go on iPhone 17 sim via `expo start -c` (Metro left running on :8081), live API with key: years, 2026/2004 models, 2004 FLSTC "gas tank" (61625-01D, 61450-95), part page all load.

### 2026-10-26 (B1 source-removal report, read-only)
- 05_supersession.mjs: dry run also writes reports/05_supersession_pairs_<ts>.csv (accepted pair -> sources: bare ref = oem_catalog, catalog_extract: = service_catalog, hydra_glide:). Dry run only, nothing applied (3,154 accepted vs 3,150 live; all 3,150 live pairs found in the file).
- New scripts/dev/source_removal.mjs: one transaction, temp tables, ROLLBACK. Removal = migration 003/007/009 DELETEs (rows of the source + rows of its parts) + inferred_span bridges left with no real row on that model code. Gate cells recomputed in SQL like gate.mjs counts (chain root + conditions); baseline equals the live gate in all 25 cells.
- Result (reports/source_removal_20261026_021113.txt): service_catalog -37.5% rows, 21,009 parts, 207 pairs, 335 bikes to zero (1991-2026 touring/softail/V-Rod/trike/RevMax/Street), gate 2 cells change (2004 FLHR blinkers 11->6, bags 8->0). hydra_glide -4.6%, 7,199 parts, 2,791 pairs (2,658 because a pair number is a hydra part), 50 vintage bikes (1936-67) to zero, gate unchanged. catalog_ocr -15.9%, 8,612 parts, 941 pairs, 66 bikes to zero (mostly 1970-90 Sportster), 33 more from 100+ to <100, gate unchanged. Not modelled: names/concepts/conditions other sources gave surviving parts; chain roots after pairs drop.

### 2026-10-26 (B3 launch paperwork, not deployed)
- apps/api/lib/legal.ts + app/privacy, app/terms route handlers: plain HTML (black/gold, light page under prefers-color-scheme), outside /v1 so no app key. Served through the existing nginx `location /`; deploys with api.sh, no nginx change. Checked locally: 200 text/html, /v1 still 401, phone width both themes, no sideways scroll.
- Privacy facts from code: search_misses = query text + vehicle_id only (no IP/device id); app stores only the page theme (AsyncStorage); no analytics/ads SDKs in apps/mobile. nginx access logs (IP + URL incl. search words) disclosed with retention [14] days: NOT verified (server read blocked); check /etc/logrotate.d/nginx.
- RevenueCat section written ahead of C4. Placeholders for Laken: owner/business name, contact email, governing-law state, hosting country (server name says ash = Ashburn, US), log retention.
- docs/APP_STORE.md: subtitle 28 / promo 163 / keywords 97 chars, description with the not-affiliated line, privacy-label answers, review notes. Footer notice confirmed on all 5 app screens.
- Follow-up for C3: link /privacy and /terms from the paywall (Apple requires both for subscriptions).
- Legal pages restyled to the app's flash-sheet look (Laken): theme.tsx palettes (dark/light by prefers-color-scheme), Bangers title + wordmark, Rye section heads over gold rules, Oswald body, Courier Prime date, inked "Short version" panel (privacy) and gold "Check before you buy" callout (terms), Privacy/Terms chips in the footer. Fonts self-hosted in apps/api/public/fonts (OFL licenses alongside; no Google requests); Dockerfile now copies public/. Checked at phone width, dark + light, all 5 fonts loaded, no sideways scroll. Not deployed.

### 2026-10-26 (EFI tag split + one-code family rows; Laken's screenshot of 61625-01D)
- Cause 1: byFamily (apps/mobile/src/lib/format.ts) only folded families with 2+ codes, so a family with one code on a part (FLSTSI = Heritage Springer) showed as a bare code among named rows. Now any code with a family gets a family row; part page draws a one-code family as a fixed row (name, "CODE · years"); PartCard says "Heritage Springer 2002". Checked in the Simulator (Expo Go). Not committed.
- Cause 2: 04 inferred 'efi' on XI bikes in years where the X bike didn't share the part (2001/2003 tagged, 2002 service_catalog untagged, 2004-05 carb FLSTC shares it), so one part's EFI bikes split into two Fits lists. 4,525 of 4,539 efi tags sat on bikes whose fuel_system is already efi.
- 04_conditions.mjs: no efi tag (inferred or text) on a bike whose fuel_system is efi; carb inference unchanged. Dry run (reports/04_conditions_20261026_023620.txt): 4,361 live rows would change ({efi} -> {} 4,268, {efi,hdi} -> {hdi} 77, {california,efi} 14, {cast_wheel,efi} 2); efi left on 7 rows. NOT applied: needs 04 --apply -> 07 --max-hole 3 -> 08.
- Metro note: `CI=1 expo start` doesn't watch files; restarted Metro without CI. Admin console restarted (http://127.0.0.1:3002) after the dev-server cleanup.
- APPLIED (Laken): 04 --apply (777,679 oem_catalog rows rewritten; efi dropped on 4,364 EFI-model rows) -> 07 --max-hole 3 (12,811 bridges) -> 08 (1,193 overrides, fitment_spans refreshed). Live: 61625-01D has one Fits list (FLSTCI/FLSTFI/FXSTBI/FXSTI/FXSTSI 2001-2005, FLSTSI 2001-2003), checked via API and in the Simulator. Gate identical (reports/gate_after_04efi.txt). efi still on 178 fitment rows overall (other sources / bridges; not looked at).

### 2026-10-26 (V-Twin catalog fitment inventory, read-only)
- VTCatalog.pdf (1,368 pp) inventoried: reports/vtwin_inventory_20261025_233449.txt (gitignored). Text, parser, checker and parsed rows outside the repo in side-session-notes .../local_e0936338.../vtwin/. hdchop checked read-only. Nothing loaded, no repo scripts.
- 4,958 H-D numbers (4,034 in oem_parts, 924 not), ~3,250 number+year(+model) facts. Years fully inside our H-D fitment 43%, mostly 28%, mostly/wholly outside 29%; model family matches 96%. V-Twin keys its replacement part's whole span to one H-D number, so its years are leads, not per-number fitment. No supersession wording in the catalog.
- Other types: ABS/carb-EFI/4-5-6-speed conditions, ~270 Early/Late mid-year breakpoints, rotor dia, stock shock/cable lengths, pulley teeth/primary links (all NOT approved). Approved size facts left to the chassis-specs session (its migration 012, 16_chassis_specs.mjs).
- Waiting on Laken: decisions 1-5 at the end of the report. Proposed 17_vtwin_oem.mjs + migration 013 (leads table or source='vtwin' fitment), dry-run default.
- Laken chose 1b (2026-10-26): DATA_RIGHTS row added (V-Twin H-D number <-> model-year fitment, numbers already in oem_parts only, pairs no other source has, source 'vtwin', confidence low). New scripts/etl/17_vtwin_oem.mjs (dry run default; pdftotext to the OS temp dir). 03/09 now also clear 'vtwin' rows (09 deletes parts they could hang on); order: 14 -> 17 -> 05 -> 06 -> 07 -> 08.
- Filters beyond "no pair from another source": platform the number already fits; no year+platform its chain already covers (H-D lists every model per year); only bikes with < 200 H-D rows (full-book bikes skipped, --all-bikes lifts it); "except", no-model (outside Touring/Sportster sections), Colony numbers, Tools section -> review.
- Dry run reports/17_vtwin_oem_20261026_035154.txt (+ .csv, review csv): 6,169 new rows, 463 parts, 307 bikes (touring 3,257, mostly CVO/variant codes with no H-D book; softail 1,053; sportster 897; vintage 370). Without the thin-bike rule: +41,037 more (mostly "1991-up Big Twin" spans onto full-book bikes). NOT applied.
- APPLIED (Laken, 2026-10-26): 17 --apply (6,169 vtwin rows, confidence low; reports/17_vtwin_oem_20261026_111057.txt) -> 05 --apply (3,155 pairs, was 3,150; chain_root changed on 5 parts; same +4/5 drift the B1 dry run already showed) -> 06 --apply (70 concepts, 16,676 parts) -> 07 --max-hole 3 (12,811 bridges, unchanged) -> 08 --apply (1,288 overrides, fitment_spans refreshed).
- Gate (local :3001): every search line identical (reports/gate_before_17vtwin.txt vs gate_after_17vtwin.txt); only change /v1/models?year=2004 "42 with parts" -> 50.
- Side effect to review: 189 bike-years that had NO fitment now have only V-Twin parts (has_parts flips true), 118 more topped up. E.g. 2004 FLHRC/FLHTCU/FLTRSE/FXSTC/FXDC (12-23 parts each), M8 softails FLFB/FXBB/FXBRS, CVO *SE codes, XR/XR750/XLCR. A rider picking one sees a short list. Bare-code bikes with no H-D rows (2004 FLHTCU while FLHTCUI has a book) look like a vehicles/fitment gap of their own.
- 2026-10-28 V-Twin follow-up (dry run only, nothing applied): 17 now (a) gives rows without a model the page heading's family when the first 8 lines name exactly one (739 recovered), (b) skips a year+platform when ANY bike there has a full H-D book (>= 200 H-D rows), vintage split by family letter. Reason: the applied per-bike rule let CVO/variant codes take parts the same year's full books don't list. New dry run reports/17_vtwin_oem_20261028_015546.txt: 2,601 rows (1987-89 Softail 1,483; 1936-48 side-valve U/V 1,105; KR 13) vs live 6,169 (keeps 871, drops 5,298, adds 1,730). Re-apply = 17 --apply -> 05 -> 06 -> 07 --max-hole 3 -> 08 + gate; waiting on Laken. Missing-number check in reports/vtwin_inventory_20261025_233449.txt (follow-up section).
- APPLIED (Laken, 2026-10-28): 17 strict --apply (deleted 6,169 vtwin rows, inserted 2,601; reports/17_vtwin_oem_20261028_020033.txt) -> 05 (3,155 pairs, 0 chain changes) -> 06 -> 07 --max-hole 3 (12,811) -> 08 (1,288 overrides, spans refreshed). Gate identical to before any vtwin load (reports/gate_after_17strict.txt; 2004 back to 42 models with parts). 58 bikes topped up, 8 have only vtwin parts.
- 2026-10-28 V-Twin full extraction (dry run, not applied): 17 now reads the catalog as tables from word boxes (new scripts/catalog/pdf_words.py, pdfplumber; pdftotext -bbox crashes on this PDF). Each H-D number takes years/models from its own table row (columns left or right of it), else the table title, else the page title; source_ref 'VT p<page>[ title|page]'. Numbers with years 5,649 (was 4,795), of which 3,859 from their own row, 1,552 from a table title, 238 from the page title. Agreement with our H-D years (any overlap): row 96%, title 94%, page 89%. Every range: reports/17_vtwin_ranges_20261028_023751.csv (6,960 ranges, 4,011 numbers). Strict load rule unchanged -> 3,220 rows (row 1,717, title 1,451, page 52; softail 1,639 = 1987-89, vintage 1,581) vs 2,601 live. NOT applied.
- APPLIED (Laken, 2026-10-28): 17 table extraction --apply (deleted 2,601, inserted 3,220 vtwin rows: row 1,717 / title 1,451 / page 52; reports/17_vtwin_oem_20261028_024815.txt) -> 05 (3,156 pairs, 1 chain change) -> 06 (16,682 parts) -> 07 --max-hole 3 (12,811) -> 08 (1,462 overrides, spans refreshed). Gate identical (reports/gate_after_17tables.txt). Only KR (1952-69) has vtwin-only fitment.
- 2026-10-28 V-Twin "work the data out" (dry run reports/17_vtwin_oem_20261028_025659.txt, NOT applied): model codes joined by hyphens (FX-FXE, FLH-FXST) now read; 61"/64" = EL only, 74"/80" = big twins; section defaults from the catalog's own index pages (Big Twin 1984-up 159-482, Classic 1915-1983 483-842 only on pages naming no 45"/Servi-Car/K/XL); section-default models only on parts that already have fitment; models after "except" left out; Knucklehead/Panhead/OHV text never lands on U/V side-valve twins. Ranges with no model 1,038 -> 358. Load set 4,053 rows (row 2,272 / title 1,690 / page 91; softail 1987-89 2,283, vintage 1,770) vs 3,220 live. Still review: 840 numbers with years not in oem_parts (234 letter-suffix siblings of ours, 43 eight-digit), 196 ranges > 3 years from ours, 53 "except" with no model, 39 section-default on parts without fitment.
- APPLIED (Laken, 2026-10-28): 17 --apply (deleted 3,220, inserted 4,053 vtwin rows; reports/17_vtwin_oem_20261028_030216.txt) -> 05 (3,156 pairs, 0 chain changes) -> 06 -> 07 --max-hole 3 (12,811) -> 08 (1,462 overrides, spans refreshed). Gate identical (reports/gate_after_17v4.txt).

### 2026-10-26 (engine specs 1984+ and chassis sizes: wheel / tire / front axle / fork tube)
- New engine modules in scripts/catalog/specs/: evo_1340_1987_90_catalog, police_1984_90_catalog, evo_bigtwin_1984_86_catalogs (speeds only; those books print no size), evo_sportster_1986_90_catalog. Wired into 12_vehicle_specs TABLES. 12 now allows ci null and drops a speeds-only row when another option for the bike gives a size with the same speeds.
- New migration 012_vehicle_chassis_specs: one row per stated fact, holding item, position, value in our wording, size_mm, source, source_rank (1 = H-D, 2 = V-Twin) and source_ref.
- New source modules in scripts/catalog/specs/chassis/:
  - hd_tire_guide_2020: 111 Stock rows, p4-14. CVO numbered variants are listed explicitly next to their base codes.
  - vtwin_axle_fork: front axle from p68 and p459; fork tube from p62, p288, p620 and p1019.
- New scripts/etl/16_chassis_specs.mjs, with these merge rules:
  - H-D wins over V-Twin.
  - A named code wins over a group or family row.
  - CODE also matches CODE+I.
  - A second stock size stays when the guide prints two (2016-17 FXSE rear, 2018-20 FLTRXSE front).
- APPLIED (Laken):
  - migration 012
  - 16 --apply: 7,268 rows on 1,558 of 1,873 bikes
  - 12 --apply: 242 rows on 233 bikes
  - 15 --apply: 1,161 portal rows, one per bike from 1991 on; the engine name is in `note` until migration 011
- /v1/models now returns chassis: { wheel_front, wheel_rear, tire_front, tire_rear, axle_front, axle_rear, fork_tube, handlebar }, each a string[].
  - Checked on the local API: 2010 FXD gives 96/1584, 19 x 2.15 / 17 x 4.50 in, 25 mm axle, 49 mm fork. 1987 FXRS gives 80/1340 5-speed, 35 mm fork.
  - NOT deployed: needs scripts/deploy/api.sh.
  - Field names sent to the mobile session.
- Gaps:
  - handlebar: no stock statement in either source
  - rear axle: no diameter printed
  - Sportster front axle
  - 2018+ Softail axle and fork
  - wheels before 1981
  - 1984-86 Evo big twins show the transmission only
  - 1986 FXSTC/FLST, 1988 FXRP size, 1990 XLH
- Nothing committed.
- DEPLOYED (Laken): api.sh run from a clean worktree of HEAD eeaac3d plus only the /v1/models chassis change. The image is hd-chop-api:eeaac3d-dirty and is healthy. Server /v1/models returns chassis and the new specs (2010 FXD, 1987 FXRS, 2017 FXSE checked).
- That HEAD already had commit eeaac3d ("B3 drafts: /privacy and /terms"), so /privacy and /terms are now public (200). The privacy page's nginx log-retention line ([14] days) is still unverified.

### 2026-10-28 (search by family: endpoint + mobile screen + admin page)
- Laken chose "both" (mobile app and admin console).
- API (apps/api): new lib/familySearch.ts, GET /v1/families, GET /v1/family-search?family=&q=[&from=&to=][&offset=] (SPEC.md API table updated). Frame families = vehicles.platform (FL Big Twin, FX Big Twin, Sportster, Touring, FXR, Softail, Dyna, V-Rod, Trike, Street, Revolution Max). Motor families = vehicles.engine (Flathead, Panhead, Shovelhead, Ironhead Sportster, Evolution Big Twin, Evolution Sportster, Twin Cam, Milwaukee-Eight). Words -> concept reuse resolveConcepts. Spans come from fitment on the family's bikes only, using the fitment_spans rule (high/medium, gaps-and-islands per root + conditions + platform + model), so a code reused on another platform (FLH fl vs touring) stays out. Sorted by first year; 60 roots per page; no concept -> trigram fallback, logged to search_misses with vehicle_id NULL.
- Not shown: Knucklehead (no EL/FL 1936-47 vehicles yet), and 1984 split-year bikes with engine NULL (touring FLHT/FLHTC/FLHTP/FLTC 1984, fxr 1984 rows) in any motor family. They still show under their frame family.
- Real data: Shovelhead + gas tank = 18 parts (e.g. 61202-67 FL/FLH 1967-1977). Touring + blinkers = 155 parts all years, 53 for 2000-2009. FXR + seat = 24. Touring + gas tank = 185. All responses 0.3-0.7 s locally.
- Gate unchanged (reports/gate_family_search.txt identical to gate_after_17v4.txt).
- apps/api/middleware.ts: added http://localhost:8084 to the dev CORS origins (only outside production). 8083 was taken by another session's Expo web.
- Mobile: new "Or search a whole family" row on the year screen (the wheel gives up 60 pt), /family picker (By frame / By motor), and /family/[key] with the search box, decade chips, common asks, and concept chips. Each part card has the number and name, condition badges, and a Model | Name | Years table (folds after 8 rows). "Show more" pages through results. Checked in Expo web at 375 px, dark and light, against the local API: no nested buttons, no sideways scroll. Not checked in the iOS Simulator. The app's default API is the deployed server, which has no /v1/family-search until api.sh is run.
- Admin: /family page (nav "Families"). It server-fetches the local API (lib/localApi.ts, HDCHOP_LOCAL_API, default http://localhost:3001), shows a panel per part with a spans table (links to /part and /model), and has prev/next paging.
- Nothing committed or deployed. While checking, `npx expo lint` installed eslint and wrote eslint.config.js; that was reverted (package.json and the lockfile restored, node_modules pruned).
- Follow-up (Laken: "make the model lists an accordion... more of the ranges and less models"): FamilyPartCard now groups each part's spans by exact year range (oldest first). Each range is a closed row showing years and "N models"; tapping it shows code + name rows. A range with one model shows that model on the same line, with nothing to open. The 8-row fold is gone. Checked in Expo web at 375 px (Touring + blinkers, 2000s): no nested buttons, no sideways scroll. Not committed.
- Follow-up (Laken: "i meant in the admin page"): apps/admin /family part panels now use the same layout. Each year range is a row ("▸ 2000–2001 · 6 models", a native <details>, closed at start); clicking it opens code / name / family rows that link to /model. A range with one model shows that model on the same line. CSS is .rng in globals.css. Checked at http://127.0.0.1:3002/family (Touring + blinkers, 2000–2009: 68 folded ranges, 148 one-model rows). The mobile change from the step before was left in place. Not committed.

### 2026-10-28 ("blinkers" -> "turn signals", Laken: riders never call them blinkers)
- Changed everywhere the word is shown or used as an example:
  - mobile common-ask chips (search + family screens)
  - search box placeholders (mobile + admin family page)
  - "try another word" empty-state hints
  - gate.mjs and source_removal.mjs gate words
  - SPEC.md, ROADMAP.md and APP_STORE.md (promo text now 167 of 170 chars)
  - search.ts comment
- Gate: same results cell for cell, only the word label changed (reports/gate_turn_signals.txt). Earlier gate reports still say "blinkers", so diff them by result, not by line.
- Left as is:
  - the search synonym ('blinkers', 'blinker' in part_concepts.user_terms for turn_signal and in data/seed/concepts_seed.csv), so a typed "blinkers" still finds turn signals. Removing it needs a seed edit + 06 --apply.
  - older HANDOFF_LOG entries (history).
- Not committed. The live app gets the new chips only with the next app build.
- Decision (Laken): keep 'blinkers'/'blinker' as a hidden search synonym for turn_signal. Never show the word in the app, admin or store text.
- 2026-10-28 V-Twin page-by-page documentation (read-only, nothing loaded): reports/vtwin_pages_20261028_222225.md (+ .csv, 44,423 rows). Every table on all 1,368 pages rebuilt from word boxes using its own header columns (Size, Length, Rim, Axle, Fork, Teeth, Volt ...), plus spec-like sentences. Each row has page, page/table title, kind (oem_fitment 4,960 / stock_size_by_model 793 / size_by_model 1,871 / oem_size 272 / prose stock specs 186 / prose size+model 329 / product-only rows) and topic (wheel/rim, fork, axle, rotor, cable length, chain/pulley, electrical, engine internals ...). Extractor: side-session-notes .../vtwin/pages.py. Spec rows still carry noise (oversize steps, wrapped notes); only wheel/axle/fork/bar sizes are approved in DATA_RIGHTS.

### 2026-10-28 — V-Twin cable/line lengths, reviewed list (vtwin deep-dive session)
- Laken asked for the cable/line lengths as a clean reviewed list first; DATA_RIGHTS row is Laken's call. Nothing loaded.
- Read every V-Twin page with cables/hoses and lengths (~70 pages) by hand and wrote `reports/vtwin_cables_reviewed.csv`: 98 rows, 74 H-D numbers.
  - Clutch 32, speedometer 25, battery cables 22, front brake hoses 9, throttle 8 (stock length per model-year, no H-D number), tach 2.
  - Each row has page + quoted line, a basis (stock_stated / oem_row / replaces / vt_join / stock_no_oem) and a confidence (high 47, medium 41, low 10).
- `scripts/catalog/vtwin_cables_check.py` (read-only) checks each quoted line is on its page (0 problems), each H-D number is printed there, and shows what the app has for each number → `reports/vtwin_cables_<ts>.md`.
  - 62 of 74 numbers are in oem_parts, all named as a cable, hose or ground strap there. 7 of the 12 missing have a letter-suffix sibling (38607-87 → 38607-87A).
- Stacked fractions: the PDF sets ¾ etc. half a line off, so "7 ”" is really 7-3/4". The checker joins them back.
- Left out: +N extensions, bulk cut-to-length cables, and cross-table V-Twin-number joins (V-Twin reuses its numbers), including the 2020-23 Touring 372004xx clutch cables.
- Catalog conflicts are kept and marked in the notes, e.g. 38617-95 is FXSTSB on p416 but the Dyna list on p417; 36-0857 is 30.5" Big Twin on p413 but 34-1/4" XL on p1000.
- Next: Laken decides on a DATA_RIGHTS row for stock cable lengths; then a table plus loader (dry-run first).
- 2026-10-29: Laken approved the cable-length DATA_RIGHTS row (high + medium rows, H-D number + length + model-year). Added the row.
  - Moved the reviewed list to `scripts/catalog/specs/vtwin_cable_lengths.csv`.
  - New migration `013_oem_part_lengths.sql` (applied) and loader `scripts/etl/18_vtwin_cable_lengths.mjs` (dry run by default).
  - Applied: 66 rows for 57 H-D numbers (clutch 24, battery 20, speedo 16, brake hose 4, tach 2; high 40, medium 26).
  - Skipped: 12 numbers not in oem_parts (7 have letter-suffix siblings), 7 low, 13 with no H-D number.
  - Fitment untouched, so no 05-08 or gate run needed. Not shown in the API or app yet (hdchop_api has no grant on the table yet).
- 2026-10-29: committed the cable work as a663293. Then built the rotor/sprocket reviewed list, `scripts/catalog/specs/vtwin_rotor_sprocket.csv` (uncommitted, not loaded).
  - 46 rows, 30 H-D numbers: brake rotor diameter 35 rows (front/rear, side, wheel type), sprocket teeth 11.
  - All quoted lines found on their pages. 26 numbers are in oem_parts, all named as a brake disc or sprocket there. Not in the app: 41500012A, 41500094, 42040-06A, 44136-84.
  - Pages: rotors 52, 54, 269, 270, 608, 609, 917, 918; sprockets 227, 239, 568, 827, 901.
  - Kept but flagged: p608's rear "41791-79 10”" looks like a misprint for 41813-79 (marked low).
  - Needs Laken's DATA_RIGHTS row before loading. It would need a sizes table (diameter / teeth); oem_part_lengths only holds lengths.
- 2026-10-29: Laken approved the rotor/sprocket DATA_RIGHTS row (high + medium, H-D number + value + model-year). Added the row.
  - New migration `014_oem_part_sizes.sql` (applied). Its unique key includes `detail`, because 44137-77A is printed twice as front 10" on p608 (FX and FXWG dual disc).
  - New loader `scripts/etl/19_vtwin_rotor_sprocket.mjs` (dry run by default). Applied: 37 rows for 26 numbers (rotor diameter 29, sprocket teeth 8; high 24, medium 13).
  - Skipped: 5 rows whose numbers aren't in oem_parts, 1 low, 3 with no H-D number. Fitment untouched.
  - Not in the API or app yet; hdchop_api has no grant on oem_part_lengths or oem_part_sizes.
- 2026-10-29: stock sizes on the part screen.
  - Correction to the two notes above: hdchop_api already reads oem_part_lengths and oem_part_sizes. `packages/db/roles/hdchop_api.sql` sets default SELECT on tables hdchop_app creates, so no grant was needed.
  - `GET /v1/part/:oem` now returns `stock_sizes` for every number in the chain: `[{oem, label, value, detail, used_on[]}]`. used_on pairs each year range with its models ('1984-99 FXST').
  - Mobile part screen: a "Stock size" section above Fits (label, value in gold, detail, years + models). An older number in the chain shows "as <number>".
  - Checked against the local API (:3001) with mobile-web-local-api: 38607-87A clutch cable 62.69 in; 41813-79 shows three rotor rows. Gate ran clean, no console errors.
  - Deployed hd-chop-api:1035eba (healthy) from a clean `git archive` of HEAD, so the chassis session's uncommitted `apps/api/app/v1/models/route.ts` change was not shipped. Live /v1/part returns stock_sizes.
- 2026-10-30: local dev over any network (Laken: "run off my hotspot").
  - New `scripts/dev/db-tunnel.sh`: SSH tunnel, 127.0.0.1:55432 on the Mac -> 127.0.0.1:5432 on the server.
    - The server already allows password logins from 127.0.0.1 (pg_hba `host all all 127.0.0.1/32`), so no server change was needed.
    - Runs as a background loop that reconnects after drops; start/status/stop; does nothing if already up.
  - Local `.env` points APP_, SOURCE_ and API_DATABASE_URL at 127.0.0.1:55432 (backup `.env.bak-20261030_162912`). `.env.example` documents it.
  - `npm run dev` in apps/admin and apps/api starts the tunnel first. ETL scripts and psql need `scripts/dev/db-tunnel.sh` run first.
  - Verified: admin 200, local /v1/part 200, ETL-style dotenv connection, and an automatic reconnect after killing the ssh process.
  - allow-db-ip.sh is no longer needed. The old allow-list lines for 108.188.232.156 and 35.139.71.102 are still in pg_hba; Laken can remove them.
  - The deployed API is unchanged (it uses ~/hd-chop/api.env on the server).
  - Not fixed: the local `.env` API_DATABASE_URL line has a second app key glued onto its end, different from HDCHOP_APP_KEYS. Laken to check.
- 2026-10-30: resolved the 13 on-hold garbled names (admin notes #5-#17).
  - Each name came from a clean reading of the same number in another H-D book: 12 from the 1950 45ci book, 45916-73 from the 1971-84 FX book p147.
  - Applied as `rename_part` overrides (reason "name_review: from H-D book <page>") and closed the 13 notes.
  - The garbled text came from OCR of the 1942 WLA book. Other 1942-WLA-only names may be garbled the same way; the 1950 45ci book is the place to cross-check them.
- 2026-10-31: 1942 WLA OCR name sweep (`reports/wla_name_fixes.csv`).
  - 52 garbled names found among parts still named from the 1942 WLA text.
  - Applied 32 as `name_review` overrides: 16 A (clean in the 1950 45ci book, page in the reason) and 16 B (read from the garbled text).
  - 20 C rows left for Laken (unreadable; mostly Army N/M parts).
- 2026-10-31: admin catalog viewer, /catalog (Laken: preview each catalog page and highlight what to document).
  - Shows each V-Twin page as an image: pdftoppm at 120 dpi, cached in $TMPDIR/hdchop_vtwin/png.
  - H-D numbers are highlighted. Drag a box: the words inside come from the PDF's own word boxes (stacked fractions joined, columns split by " | ").
  - Pick a kind (fitment range / size / stock spec / supersession / other), edit the text, add a note, save.
  - Saved boxes stay drawn; click one to edit, change status or delete. Keys: ← → for pages, Esc drops the box. Export CSV at /api/catalog/captures/export.
  - New migration `015_catalog_captures.sql` (applied). Captures are review material only; DATA_RIGHTS still decides what loads.
  - Files: apps/admin/lib/catalog.ts, app/catalog/{page,viewer}.tsx, app/api/catalog/**, globals.css, a nav link.
  - Tested on p417: drag, save and redraw all work, and the console is clean. The test capture was deleted.
  - Only the V-Twin PDF so far; the H-D OCR books need word boxes (tesseract tsv) to plug in.
- 2026-10-31: catalog viewer, Part field and suggested boxes. Laken's 106 captures (pp 3-42, all kind fitment) = per part type, the year/model ranges where it changes.
  - Migration `016_catalog_capture_part.sql` (applied):
    - `part` (copied from the note for the 78 that had one) and `concept_slug` (set when the part matches a part_concepts name or term; 7 linked).
    - New status 'skipped'.
  - Part box: suggests our 70 part types plus every part name already used (/api/catalog/parts).
  - `apps/admin/lib/catalogSuggest.ts`: suggests boxes around runs of year/model lines, widened to their table row, with the heading above as the part name.
    - It ignores column headers, notes, V-Twin/Colony numbers posing as years, and boxes overlapping saved or skipped captures.
  - Scored against Laken's boxes with ?all=1 (pages 3-42): 89% of boxes matched, 78% word recall, ~2.5 extra suggestions per page, 46 part-name guesses agree. The misses are boxes with no years in them (sizes, counts).
  - Keys: Enter accepts (Enter also saves drawn and edited boxes), Esc skips for good, Shift+Enter adds a line, drag draws your own box. Tested on p44; test rows deleted.
  - Known: tables whose columns touch can share one suggested box (p44 shifter shaft + bushing kit).
- 2026-10-31: committed the chassis/engine-spec work above (it had been deployed from a dirty worktree but never committed).
  - Regression: the 2026-10-29 deploy hd-chop-api:1035eba was built from clean HEAD, which didn't contain the uncommitted /v1/models chassis change.
  - Live /v1/models has had no `chassis` since then (checked 2010 FXD), so the YOUR BIKE sizes are missing in the app. A redeploy from this commit restores it.
- 2026-10-31: redeployed hd-chop-api:7944555 from a clean tree (healthy). Live /v1/models has chassis again (2010 FXD 19 x 2.15 / 17 x 4.50 in, 25 mm axle, 49 mm fork; 1987 FXRS 80 ci 5-speed, 35 mm fork). /v1/part stock_sizes and /privacy still work.
- 2026-10-31: documented 99427-84 (Non-Current Shovelhead Engine Parts 1966-84). Laken's "(2)" copy is identical to the known book 1966-84-shovel-engine.
  - The parts pages (PDF 3-10) were already loaded by 11: 241 numbers, 11,793 fitment rows.
  - New: `scripts/catalog/specs/shovel_99427_84.mjs`, transcribed from the page images and not loaded anywhere:
    - HISTORY: engine changes by year
    - VIN_70S and VIN_80S: model codes; 1984 dry/wet clutch vs EVO
    - MODELS: years, ci, speeds, hp, features
  - Report: `reports/shovel_99427-84_documented.md`, plus 71 size facts in `reports/shovel_99427-84_sizes.csv`.
  - Leads for Laken:
    - 1984 FLTC/FLHTC/FLHTP/FXRS/FXRT/FXRP have no engine set; the book says Evo.
    - FL 57 hp and FLH 66 hp; no horsepower is stored for 1966-84 yet.
    - VIN-table models missing from vehicles: FLHP, FLHX 1984, FLHS 1981-83, FLTC 1981/83, FLHTP 1983, FXRP 1983.
- 2026-10-31: applied two fixes from 99427-84 (Laken).
  - 01_vehicles has a new `CODE_ENGINE` (per model, changeover years). From the book's 1984 VIN table: 1984 FLTC, FLHTC, FLHTP, FXRS, FXRT, FXRP = evolution_bigtwin.
    - 01 --apply changed exactly those 6. 1984 FLHT, FXR and FXRDG are still unset (the book doesn't mark them).
  - `shovelhead_model_history.mjs` now gives FL 57 hp and FLH 66 hp for 1966-80 (74 ci).
    - 12 --apply: 242 rows replaced; 30 bikes now have horsepower (the 80 ci FLH option has none).
  - Gate unchanged. Local /v1/models 1970 FLH shows 66 hp. Not deployed; the live API reads the same DB, so it already serves these.
- 2026-10-31: fuel gauges searchable (Laken: 75053-01B wasn't). "fuel gauge" used to find only Speedometer (trigram on its "gauge" term).
  - New part types in `data/seed/concepts_seed.csv`:
    - fuel_gauge (44 parts): fuel gauge, gas gauge, fuel level.
    - fuel_sender (57 parts): fuel level sender/sensor, sending unit; excludes oil/pressure/temperature/speed/neutral. Every bare "Sending unit" is a 75xxx fuel sender.
  - Moved: 2 fuel gauges out of speedometer, 1 fuel sender out of wiring harness. Gaskets, harnesses and bulbs keep their own type.
  - Ran 06 --apply, 07 --max-hole 3, 08. Gate unchanged.
  - Live, 2005 FLSTC: "fuel gauge" / "gas gauge" -> 75053-01B; "fuel sender" / "sending unit" -> 75207-04A.
