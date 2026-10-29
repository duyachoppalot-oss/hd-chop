# HD Chop — Product & Technical Spec

## Core flow
1. User picks **year** → **model** (shown by name, e.g. "Road King", stored as code FLHR).
2. User types plain words: "gas tank", "turn signals", "bags", "kickstand".
3. App returns every OEM part for that concept that fits the bike, grouped by part (with superseded numbers merged), each with:
   - the year span the same part was used, per model
   - the conditions that split it (carbureted vs EFI, ABS, CVO, etc.)

Example. User: 2001 FLHT + "gas tank":
```
Fuel Tank — fits your 2001 FLHT
  ● 61xxx-98  Carbureted     1998–2003  FLHT, FLHR, FLTR
  ● 61yyy-98  Fuel injected  1998–2007  FLHT, FLHR, FLTR, FLHTCU
```
(Numbers are placeholders. Real output comes from data.)

## Search pipeline
1. **Resolve words → concept.** Normalize the query (lowercase, trim, collapse spaces). Match against `part_concepts.user_terms`, `hd_terms`, `display_name`: exact first, then `pg_trgm` similarity ≥ 0.4 for typos. Return up to 3 candidate concepts. If several match, the UI shows chips to pick one.
2. **Concept + vehicle → parts.** `fitment` rows where `vehicle_id` = selected bike and `oem_parts.concept_id` = concept. Collect their `chain_root`s.
3. **Expand spans.** Read `fitment_spans` for those chain roots across all models. Keep:
   - the selected model always
   - other models only if the span overlaps the selected year ± 10 (keeps the list readable; "show all" expands it)
4. **Group** by `chain_root` + `conditions`. Display the newest OEM number in the chain, with older numbers under "Replaces".
5. **Fallback.** If no concept matches, run trigram search on `oem_parts.description_clean` for that vehicle and log the query to `search_misses` (that table is the to-do list for new synonyms).

## Data model (see packages/db/migrations/001_core.sql)
- `vehicles` — one row per year + model code. Includes platform, engine, `fuel_system` (`carb` | `efi` | `unknown`).
- `model_aliases` — names people use → model code, year-bounded.
- `part_concepts` — the vocabulary layer. `hd_terms` = how HD catalogs word it; `user_terms` = how people say it.
- `oem_parts` — normalized OEM number, cleaned description, `concept_id`, `chain_root`.
- `oem_supersession` — from → to pairs. `chain_root` = the newest number reachable in the chain.
- `fitment` — OEM number × vehicle × `conditions text[]` (sorted, deduped) + `condition_source`.
- `condition_tags` — controlled list of conditions + the regex patterns used to extract them.
- `fitment_spans` (materialized view) — fitment years collapsed into continuous ranges per chain root / model / conditions (gaps-and-islands).
- `search_misses` — queries that found nothing.

## Conditions
Pulled from catalog text (footnotes, "for carbureted models", "EFI", etc.) into `fitment.conditions`.
- `condition_source = 'catalog_text'` — found in source text (preferred)
- `'inferred'` — derived by comparing `vehicles.fuel_system` across two overlapping parts for the same concept. Show a lighter badge in the UI.
- `'salvage_verified'` — confirmed by a part pulled off a real bike (Phase 5)

Starter tags: `carb`, `efi`, `abs`, `non_abs`, `cvo`, `california`, `hdi`, `cable_clutch`, `hydraulic_clutch`, `cast_wheel`, `laced_wheel`. Add tags only when discovery shows they occur in the data.

## Seeds
`data/seed/concepts_seed.csv` and `model_aliases_seed.csv` are **starting points, not truth**. The `hd_terms` column is a best guess at catalog wording. ETL step 05 must report how many `oem_parts` each term matches. Terms that match 0 get fixed from real description data before `--apply`.

## API (apps/api, read-only DB role)
| Method | Path | Returns |
|---|---|---|
| GET | `/v1/years` | available years |
| GET | `/v1/models?year=` | `[{model_code, model_name, platform, has_parts, specs: [{ci, cc, speeds, horsepower, compression, mid_year_change, source_ref}]}]` (specs from `vehicle_specs`; several = engines sold that year; `[]` when no H-D document covers the bike) |
| GET | `/v1/search?year=&model=&q=` | `{concepts:[...], results:[{concept, parts:[{oem, replaces[], description, conditions[], condition_source, spans:[{model_code, year_start, year_end}]}]}]}` |
| GET | `/v1/part/:oem` | part detail, full chain, all spans |
| GET | `/v1/families` | `[{key, name, kind: frame\|motor, year_start, year_end, models}]`: frame = `vehicles.platform` (Touring, Dyna, FXR, FL/FX big twin…), motor = `vehicles.engine` (Panhead, Shovelhead, Twin Cam…); only families with fitment |
| GET | `/v1/family-search?family=&q=[&from=&to=][&offset=]` | Same concept resolution as `/v1/search`, over every bike in the family (optionally cut to years). `results:[{concept, total, parts:[{oem, replaces[], description, conditions[], condition_source, year_start, year_end, spans:[{model_code, model_name, family, family_key, year_start, year_end}]}]}]`; spans built from the family's bikes only; 60 chain roots per page (`offset`) |
| GET | `/v1/vin/:vin` | Phase 4: decode VIN (NHTSA vPIC) → year + model |

Free vs paid gating is enforced in the API (Phase 4), not just hidden in the UI.

## Free vs paid (Phase 4)
- Free: year/model + search, results limited to the selected model's span.
- Paid: cross-model spans ("same part fits these other bikes"), full supersession history, VIN lookup, saved garage, salvage availability.
- Shop tier (later): bulk lookup, API key.

## Non-goals (for now)
- No aftermarket/vendor catalog content (see DATA_RIGHTS.md).
- No prices, no vendor names, no copied catalog images or diagrams.
- No accounts beyond what RevenueCat needs until the garage feature.
