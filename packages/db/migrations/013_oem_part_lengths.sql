-- 013: stock length of an H-D cable / line number (scripts/etl/18_vtwin_cable_lengths.mjs):
-- clutch, throttle, speedometer, tach, battery cable, brake hose. Keyed by the part
-- number, not the bike: the length belongs to the number; years / models are the ones
-- the source prints with it (context for the rider, not fitment). Several rows for one
-- number = the source prints more than one length (52-3/8 in and 52.25 in for 38618-68).
-- Every row names its source + page. The source name is never shown in the app.
-- Removable: DROP TABLE oem_part_lengths.
BEGIN;

CREATE TABLE oem_part_lengths (
  part_length_id serial       PRIMARY KEY,
  oem_number     text         NOT NULL REFERENCES oem_parts ON DELETE CASCADE,
  item           text         NOT NULL CHECK (item IN ('clutch_cable', 'throttle_cable', 'speedometer_cable', 'tach_cable', 'battery_cable', 'brake_hose')),
  detail         text         NOT NULL DEFAULT '',   -- our wording: 'idle', 'solenoid to starter', '16mm top nut', 'female end'
  length_in      numeric(6,3) NOT NULL,              -- inches, for sorting / comparing
  value          text         NOT NULL,              -- our wording: '7-3/4 in', '62.69 in'
  years          text         NOT NULL DEFAULT '',   -- as printed with the number: '1987-06', '1984-85 / 1980-86'
  models         text         NOT NULL DEFAULT '',   -- as printed: 'FLT FXST FXSTC FLST', 'FXST; FXWG'
  source         text         NOT NULL,              -- 'vtwin'
  source_ref     text         NOT NULL,              -- 'VT p417'
  confidence     text         NOT NULL CHECK (confidence IN ('high', 'medium')),
  note           text,
  UNIQUE (oem_number, item, length_in, source, source_ref)
);
CREATE INDEX ON oem_part_lengths (oem_number);

COMMENT ON TABLE oem_part_lengths IS
  'Stock cable / line length per H-D number from documents. Several rows = the source prints several lengths.';

COMMIT;
