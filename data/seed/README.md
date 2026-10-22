# Seeds — starting points, not truth

- `concepts_seed.csv`: arrays are pipe-separated. `hd_terms` is a guess at catalog wording. ETL step 05 reports match counts per term; fix any 0-match term from `reports/02_descriptions` output before `--apply`.
- `model_aliases_seed.csv`: year bounds marked "verify" must be confirmed against `vehicles` / source `harley_families` before load. Model codes vary by year (e.g. Fat Boy FLSTF vs FLFB); trust the data over this file.
- Add user wording from `search_misses` as it accumulates.
