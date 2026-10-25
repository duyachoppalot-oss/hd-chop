-- 009: fourth parts source, 'hydra_glide': the hydra-glide.net OEM parts lists Laken
-- scraped (DATA_RIGHTS row, approved 2026-10-25), loaded by
-- scripts/etl/14_hydra_glide.mjs. Removable:
--   DELETE FROM fitment WHERE source = 'hydra_glide';
--   DELETE FROM fitment WHERE oem_number IN (SELECT oem_number FROM oem_parts WHERE source = 'hydra_glide');
--   DELETE FROM oem_parts WHERE source = 'hydra_glide';
BEGIN;
ALTER TABLE oem_parts DROP CONSTRAINT oem_parts_source_check;
ALTER TABLE oem_parts ADD CONSTRAINT oem_parts_source_check
  CHECK (source IN ('oem_catalog', 'service_catalog', 'catalog_ocr', 'hydra_glide'));
COMMIT;
