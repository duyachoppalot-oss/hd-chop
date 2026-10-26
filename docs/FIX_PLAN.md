# HD Chop — Fix Plan (handoff from claude.ai review, 2026-10-25)

Claude Code works through it top to bottom.

## Rules for this plan
- Everything in CLAUDE.md still applies: dry run first, `--apply` only after Laken says go, real data over guesses, terse reports.
- One task at a time. Each task ends at a **STOP**: report what changed, the evidence, and wait for Laken's OK.
- Tick the box here when a task is done. Append a HANDOFF_LOG entry at the end of every session.
- Tasks marked **[Laken]** need Laken's hands (accounts, money, settings). List them for him; don't work around them.
- First step of the first session: add each task below to `admin_tasks` (one row per task, source = claude) so `scripts/dev/notes.mjs` tracks them.
  - Done 2026-10-25: admin_tasks rows titled "FIX_PLAN <id>: ...". D3 = existing task #14, C4 = existing task #19 (retitled, not duplicated).

## Order at a glance
| Phase | Why first | Tasks |
|---|---|---|
| A. Lock it down | The data can be copied today | A1–A4 |
| B. Know the legal exposure | Decides what can be sold | B1–B3 |
| C. Get paid | Nothing earns money yet | C1–C4 |
| D. Features that sell | Reasons to subscribe | D1–D5 |
| E. Ship | TestFlight → App Store | E1–E3 |

---

## A. Lock it down

### A1 [Laken] Make the GitHub repo private
- [ ] github.com/duyachoppalot-oss/hd-chop → Settings → Change visibility → Private.
- Why: the API address, all ETL rules, the concept wording and DATA_RIGHTS.md are public now. No data or passwords leaked (checked).
- Claude Code: after Laken confirms, check that Vercel or any other linked service still has access if it's needed (see Work Board "Decide what goes on Vercel").

### A2 API rate limit
- [x] Write an nginx `limit_req` snippet for `/v1/*` (suggest 30 req/min per IP, burst 20) in `scripts/deploy/nginx-hdchop.conf`. The live nginx config isn't in the repo, so give Laken the exact lines and the `nginx -t && systemctl reload nginx` commands. (2026-10-25: snippet + `scripts/deploy/check-ratelimit.sh`)
- [x] Check: 50 fast requests from one IP → 429s after the burst. Normal app use unaffected. (2026-10-26: applied with `scripts/deploy/apply-ratelimit.sh`; 26 × 200, 24 × 429; years/models/search 200 after a 10 s pause)
- **STOP** — Laken applies the nginx change.

### A3 App key + CORS
- [x] API: require header `X-App-Key` matching `HDCHOP_APP_KEYS` (comma list, from `api.env`, so keys can be rotated). Missing/wrong → 401. `/healthz` stays open if it exists.
- [x] CORS: drop `*`. Allow only the Expo web dev origins (localhost:8081/8083) when `NODE_ENV !== 'production'`.
- [x] Mobile: send the key from `EXPO_PUBLIC_APP_KEY`; add it to `eas.json` profiles (done as EAS environments, not a literal: eas.json is committed and the repo is still public) and to the run notes in `apps/mobile/README.md` (simulator, Expo Go, web).
- [x] Note in the README: an app key in the binary only stops casual scraping. Real protection = rate limit (A2) + paid gating (C2).
- [ ] Check: curl without key → 401; with key → same results as before; Simulator + Expo Go still work. (2026-10-26 live: 401 / 200, gate 25 cells identical to local; Expo web OK; Simulator + Expo Go not checked yet)
- **STOP** — show diff, then deploy with `scripts/deploy/api.sh`.

### A4 [Laken] Real domain
- [ ] Laken buys/chooses the domain (e.g. api.hdchop.app). Claude Code then: nginx server_name + Let's Encrypt steps, `EXPO_PUBLIC_API_URL` defaults in `api.ts` and `eas.json`, CLAUDE.md + README URLs. Keep nip.io working until the app build that uses the new domain is live.

---

## B. Know the legal exposure

### B1 Source-removal report (read-only)
For each removable source (`service_catalog`, `hydra_glide`, `catalog_ocr`), report what the app loses if that source is pulled:
- [ ] fitment rows, parts, supersession pairs, concepts that only that source supplies
- [ ] bikes (year + model) that would drop to zero parts, and to under 100 parts
- [ ] the 25 gate searches (`apps/api/scripts/gate.mjs`) re-run as if the source were gone (do it in a rolled-back transaction or a scratch copy of the spans; never touch live)
- Output `reports/source_removal_<ts>.txt`. Laken takes this to the lawyer.
- **STOP**

### B2 [Laken] Lawyer review
- [ ] H-D service portal terms, hydra-glide.net (ask the owner too), the "HD Chop" name vs H-D trademarks, the not-affiliated notice. Decision recorded in DATA_RIGHTS.md.

### B3 Launch paperwork
- [ ] Draft a privacy policy page (what's collected: search text in `search_misses`, purchase status via RevenueCat; no accounts, no location) and terms. Plain HTML served by the API's nginx host at `/privacy` and `/terms`.
- [ ] "Not affiliated with or endorsed by Harley-Davidson" in the app footer (check it's there) and in App Store text drafts.
- **STOP**

---

## C. Get paid

### C1 Paywall data in the API
- [ ] `/v1/search` and `/v1/part/:oem`: add `also_fits_count` (number of other families) and `chain_length` to every part, free tier included.
- [ ] Check against 59786-01 and 40037-79A (family grouping tests from 2026-10-25).

### C2 Server-side gating
- [ ] Tier from a request header set by the app (`X-Tier: free|pro`) for now, verified later in C4. Free: spans for the rider's family only, newest number only. Pro: all families, full replaces chain, `?all=1`.
- [ ] Free responses must not contain the pro data at all (not just hidden in the UI).
- [ ] Gate script: run the 25 cells as free and as pro; free never leaks other-family spans.
- **STOP**

### C3 Paywall screen in the app
- [ ] Part card / part page: "Also fits N other bikes" free; tap → paywall sheet. Black and gold flash-sheet style per CLAUDE.md Design.
- [ ] Paywall copy: what Pro unlocks (also-fits list, full number history, VIN lookup, garage, swap-meet mode offline). Placeholder prices until Laken sets them.
- [ ] Check in the Simulator at phone size.
- **STOP**

### C4 [Laken first] RevenueCat
- [ ] Laken: Apple Developer Program, bundle ID, App Store Connect app, subscription products, RevenueCat project. List exactly what's needed from him.
- [ ] Then: `react-native-purchases`, entitlement `pro`, restore purchases button. API verifies the tier with RevenueCat (subscriber lookup by app user ID, cached) instead of trusting `X-Tier`.
- Needs a dev build (`npx expo run:ios`), not Expo Go.
- **STOP**

---

## D. Features that sell

### D1 Stinkin' Supplies link readiness (read-only first)
- [ ] Count `oem_parts` whose normalized number matches `catalog_oem_crossref` (`oem_format IN ('hd_oem','hd_oem_nodash') AND expanded_from = FALSE`, `normalize_oem()`) with an active `catalog_unified` product. Report % overall, by platform, and for parts with a concept.
- **STOP** — Laken decides if the button ships now or after crossref cleanup.
- [ ] Then: API field `shop_url` (link only; no vendor names, text, prices or images, per DATA_RIGHTS). Button "Find it at Stinkin' Supplies" on the part page. Free tier too.

### D2 Swap-meet mode (part number lookup)
- [ ] New screen: type a part number (accept dashes/spaces/old forms) → `/v1/part/:oem`. Show name, H-D intro year (`part_component_types`), newest number, bikes it fits (pro: all).
- [ ] Offline plan: report what an offline bundle needs (parts + spans size, compressed) before building it.
- **STOP**

### D3 Engine names (Work Board item, already planned)
- [ ] Migration 011 (engine column), `15_portal_specs` dry run → **STOP** → apply, then API/app/admin show "Twin Cam 96B", "Milwaukee-Eight 114", etc.

### D4 VIN decode incl. pre-1981 (read-only first)
- [ ] Report: per year 1936–1980, which model-ID / serial tables we already parse (portal VIN tables, 1984-86 'vin' layout legends, book title pages) and what's missing.
- [ ] 1981+: `/v1/vin/:vin` via NHTSA vPIC → year + model code, matched to `vehicles`. Pro feature.
- **STOP** after the report; pre-1981 decoder is built only from documented tables.

### D5 Saved garage
- [ ] Bikes saved on device first (no accounts). Pro: several bikes, quick switch. Later: alerts.

---

## E. Ship

### E1 [Laken] Accounts
- [ ] Apple Developer Program, Team ID, App Store Connect record, Expo account. Replace placeholders in `app.json` / `eas.json` (see `apps/mobile/README.md` → TestFlight).

### E2 TestFlight
- [ ] `eas build -p ios --profile production` → `eas submit`. 5 riders use it without help (Phase 3 gate).

### E3 App Store
- [ ] Screenshots from the Simulator, listing text, privacy labels, review notes (how to test Pro).
- Gate: legal review done (B2), real domain (A4), App Review approved.
