-- 016: catalog captures get a part name (what the box is about: "outer primary cover"),
-- linked to a part type when it matches one (part_concepts display name or terms), and a
-- 'skipped' status for suggested boxes Laken turned down (kept so they aren't suggested again).
-- Existing captures: the note held the part name in most, so it is copied into part.
BEGIN;

ALTER TABLE catalog_captures
  ADD COLUMN part text NOT NULL DEFAULT '',
  ADD COLUMN concept_slug text REFERENCES part_concepts (slug) ON UPDATE CASCADE ON DELETE SET NULL,
  DROP CONSTRAINT catalog_captures_status_check,
  ADD CONSTRAINT catalog_captures_status_check CHECK (status IN ('new', 'reviewed', 'loaded', 'rejected', 'skipped'));

UPDATE catalog_captures SET part = note WHERE part = '' AND note <> '';

COMMIT;
