-- 017: NHTSA safety recalls per vehicle, and specification-table rows from H-D owner's
-- manuals (docs/DATA_RIGHTS.md rows of 2026-11-01).
--   nhtsa_recalls / vehicle_recalls: scripts/etl/20_nhtsa_recalls.mjs --apply, from NHTSA's
--     recall flat files (public US-government data). vehicle_recalls.matched_by: 'model'
--     (NHTSA's model text = our code / family / name that year) or 'summary' (codes the
--     defect summary names in parentheses).
--   manual_specs: scripts/etl/22_manual_specs.mjs --apply, the spec tables pulled from each
--     owner's manual (one row per printed table row, our cells joined by ' | '). Keyed by the
--     manual, not a vehicle: a manual covers a year and a family (or the codes in its title);
--     the admin model page matches them. Admin only until the pre-launch legal review
--     (H-D portal Terms of Use, DATA_RIGHTS line 9); hdchop_api gets no grant.
-- Removable: DROP TABLE vehicle_recalls, nhtsa_recalls, manual_specs.
BEGIN;

CREATE TABLE nhtsa_recalls (
  campaign     text PRIMARY KEY,           -- NHTSA campaign number, '18V076000'
  report_date  date,
  component    text NOT NULL DEFAULT '',
  hd_recall    text NOT NULL DEFAULT '',   -- H-D's own recall number when printed, '0171'
  summary      text NOT NULL DEFAULT '',
  consequence  text NOT NULL DEFAULT '',
  remedy       text NOT NULL DEFAULT '',
  source_ref   text NOT NULL               -- 'NHTSA FLAT_RCL'
);

CREATE TABLE vehicle_recalls (
  campaign    text    NOT NULL REFERENCES nhtsa_recalls ON DELETE CASCADE,
  vehicle_id  integer NOT NULL REFERENCES vehicles ON DELETE CASCADE,
  nhtsa_model text    NOT NULL,            -- as NHTSA prints it: 'FLHTCUI', 'FLH SERIES'
  matched_by  text    NOT NULL CHECK (matched_by IN ('model', 'summary')),
  PRIMARY KEY (campaign, vehicle_id)
);
CREATE INDEX ON vehicle_recalls (vehicle_id);

CREATE TABLE manual_specs (
  manual_spec_id serial   PRIMARY KEY,
  year        smallint NOT NULL,
  family      text     NOT NULL,           -- from the manual title: touring, softail, dyna, sportster, ... 'other'
  manual      text     NOT NULL,           -- manual title
  manual_ref  text     NOT NULL,           -- H-D reference, '99466-07'
  kind        text     NOT NULL,           -- engine, capacities, weights, dimensions, tire_sizes, bulbs, ...
  table_title text     NOT NULL,
  page        smallint,
  label       text     NOT NULL,
  value       text     NOT NULL,           -- the row's other cells, ' | ' between them
  ocr         boolean  NOT NULL DEFAULT false   -- from an OCR'd scan (rough)
);
CREATE INDEX ON manual_specs (year, family);

COMMENT ON TABLE manual_specs IS
  'Spec-table rows from H-D owner''s manuals, per manual. Admin only (no API grant) until the legal review.';

COMMIT;
