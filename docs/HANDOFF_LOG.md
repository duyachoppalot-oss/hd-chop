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
