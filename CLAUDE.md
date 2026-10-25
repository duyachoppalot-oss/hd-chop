# HD Chop — Claude Code instructions

Harley-Davidson OEM part fitment lookup app. User picks year + model, types plain words ("gas tank"), gets every OEM part that fits, the year span each part was used, and the conditions that split it (carbureted vs EFI, ABS, etc.). Monetized as an App Store subscription. Brand-new repo. Owner: Laken (solo dev).

## Read first, every session
1. docs/SPEC.md — product, search pipeline, API contract
2. docs/DATA_RIGHTS.md — what source data may be copied into this app
3. docs/ROADMAP.md — current phase and gates
4. docs/HANDOFF_LOG.md — append an entry at the end of every session
5. `node scripts/dev/notes.mjs` — Laken's open admin-console notes (and recent overrides). Propose a fix for each open note; mark it done only after the fix is applied.

## Stack
- `apps/mobile` — Expo (Expo Router, TypeScript)
- `apps/api` — Next.js 15 route handlers (TypeScript), Docker container on the Hetzner DB server behind nginx: https://hdchop.5.161.100.126.nip.io
- `apps/admin` — local-only admin console (Next.js 15, `npm --prefix apps/admin run dev` → http://127.0.0.1:3002): model/concept/part timelines, data web, notes, overrides. Uses the owner role from the root .env. Never deploy it.
- `packages/db/migrations` — numbered plain `.sql` files
- `scripts/etl`, `scripts/discovery` — Node ESM `.mjs`, `pg` Pool
- DB: dedicated Postgres database `hdchop` (`APP_DATABASE_URL`)
- Source data: existing Stinkin' Supplies catalog DB (`SOURCE_DATABASE_URL`, read-only role)
- Search MVP: Postgres only (`pg_trgm` + synonym table). Typesense is optional later.
- Subscriptions: RevenueCat (Phase 4)

## Hard rules
1. Never write to the source DB. Only SELECT from `SOURCE_DATABASE_URL`.
2. Every ETL/mutation script is dry-run by default and writes only with `--apply`. Dry run writes `reports/<script>_<timestamp>.txt` with row counts + 20 sample rows.
3. Real data over guesses. Query the source and show counts before mapping or seeding. Never invent part numbers, years, or fitment.
4. Copy only the columns cleared in DATA_RIGHTS.md.
5. Postgres regex word boundary is `\y`, not `\b` (write `\\y` inside JS template strings).
6. Deployed code connects via `APP_DATABASE_URL` only (the `hdchop_api` role over 127.0.0.1, set in `~/hd-chop/api.env` on the server). Deploy with `scripts/deploy/api.sh`. hdchop_api has no internet-facing pg_hba rule; don't add one.
7. Redirect large script output: `node script.mjs > reports/out.txt 2>&1`
8. Check syntax after edits: `node --check file.mjs && echo "SYNTAX OK"`
9. Use `str_replace` for targeted edits; heredoc for full-file writes.
10. Be terse. Act, then report.

## Harley domain rules
- Code meaning depends on the year — read docs/HD_TERMINOLOGY.md before turning any model text into vehicles/fitment.
- FL/FX combined token = Softail from 1984; before 1984 it means all FL + FX big twins. Bare FL ≤1984 = FL big twin family incl. FLH (platform `fl`); bare FL in modern vendor text = Touring; bare FX 1971–86 = FX Super Glide family (platform `fx`), later = Dyna (mounting is physically incompatible).
- FXR is its own family and frame (1982–94), never FX or Softail. EL = 61 ci OHV (Knucklehead 1936–47, Panhead 1948–52). W/WL/WLA etc. are models of their own.
- Vendor/Stinkin' family labels (`product_fitment_year_model.family_name`, `catalog_fitment_v2`) are wrong for old bikes; resolve from the raw code + year.
- Twin Cam is an engine generation, not a synonym for Big Twin.
- EVO 883/1200 = Evolution-era Sportster XL883/XL1200.
- OEM number year suffix (century-aware): 3–4 digit base = always 19XX; 5+ digit base: 00–26 = 20XX, 27–99 = 19XX.
- Letter suffixes at the same year = parallel options, not timeline steps.
- Model names get reused across platforms (Fat Bob: Dyna FXDF vs Softail FXFB). Model aliases must be year-bounded.

## Design
Mobile-first. Black and gold, drawn like a kustom-kulture flash sheet: flat fills, firm outlines, hard offset shadows (no blur), Bangers comic caps for headings, Rye banner lettering for section heads, Courier Prime for part numbers. Two pages, rider's choice (Dark / Light / Phone, saved on device): dark = black page with gold lines; light = white page with black lines and gold fills/shadows (gold text darkened to stay readable). The year wheel is a refined custom tire (gold rim, pinstripes, raised lettering), not a gag drawing. All colors come from `apps/mobile/src/lib/theme.tsx` (`useTheme` / `useStyles`); never hard-code a page color in a screen. Big tap targets, readable in a garage.
