# Seeds — starting points, not truth

- `concepts_seed.csv`: arrays are pipe-separated. `match`: `head` (term must end the part name, noun-first catalog order reversed) or `contains` (component families like Tour-Pak, air cleaner). `exclude_terms`: phrases that keep a part out of the concept. Matching lives in scripts/etl/06_concepts.mjs. `hd_terms` is a guess at catalog wording. ETL step 06 reports match counts per term; fix any 0-match term from `reports/02_descriptions` output before `--apply`.
- `model_aliases_seed.csv`: year bounds marked "verify" must be confirmed against `vehicles` / source `harley_families` before load. Model codes vary by year (e.g. Fat Boy FLSTF vs FLFB); trust the data over this file.
- Add user wording from `search_misses` as it accumulates.
