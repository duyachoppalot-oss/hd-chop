-- Which ETL step created an oem_parts row (docs/ETL_PLAN.md step 09).
-- oem_catalog     = 02_parts (stinkin_catalog hd_oem_catalog_reference)
-- service_catalog = 09_service_catalog (scraped H-D service-portal catalogs,
--                   DATA_RIGHTS.md open terms question). 02 never deletes these;
--                   the whole source is removable:
--   DELETE FROM fitment WHERE oem_number IN (SELECT oem_number FROM oem_parts WHERE source = 'service_catalog');
--   DELETE FROM fitment WHERE source = 'service_catalog';
--   DELETE FROM oem_parts WHERE source = 'service_catalog';
--   then re-run 05 -> 06 -> 07 and refresh fitment_spans.
-- Existing rows all came from 02. The default is dropped afterwards so every
-- insert has to say where the row came from (same rule as 002).
BEGIN;
ALTER TABLE oem_parts
  ADD COLUMN source text NOT NULL DEFAULT 'oem_catalog'
  CHECK (source IN ('oem_catalog','service_catalog'));
ALTER TABLE oem_parts ALTER COLUMN source DROP DEFAULT;
CREATE INDEX ON oem_parts (source);
COMMIT;
