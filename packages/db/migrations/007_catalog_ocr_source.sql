-- 007: third parts/fitment source, 'catalog_ocr': H-D parts-catalog PDFs read by
-- scripts/catalog (OCR) and loaded by scripts/etl/11_catalog_books.mjs --apply
-- (docs/CATALOG_READER.md, DATA_RIGHTS.md). fitment.source is free text already;
-- only oem_parts.source has a CHECK.
-- Removable, like service_catalog (003):
--   DELETE FROM fitment WHERE source = 'catalog_ocr';
--   DELETE FROM fitment WHERE oem_number IN (SELECT oem_number FROM oem_parts WHERE source = 'catalog_ocr');
--   DELETE FROM oem_parts WHERE source = 'catalog_ocr';
BEGIN;
ALTER TABLE oem_parts DROP CONSTRAINT oem_parts_source_check;
ALTER TABLE oem_parts ADD CONSTRAINT oem_parts_source_check
  CHECK (source IN ('oem_catalog', 'service_catalog', 'catalog_ocr'));
COMMIT;
