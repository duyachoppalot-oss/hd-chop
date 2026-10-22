-- Row counts + columns for every source table the app may draw from.
-- Run against SOURCE_DATABASE_URL (read-only).
SELECT relname AS table_name, n_live_tup AS approx_rows
FROM pg_stat_user_tables
WHERE relname IN ('oem_fitment','oem_supersession','oem_part_timeline','catalog_oem_crossref',
                  'harley_families','model_alias_map','bike_specs','catalog_fitment_v2')
ORDER BY relname;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('oem_fitment','oem_supersession','oem_part_timeline',
                     'harley_families','model_alias_map','bike_specs')
ORDER BY table_name, ordinal_position;
