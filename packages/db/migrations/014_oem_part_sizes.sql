-- 014: stock size of an H-D part number that isn't a length (scripts/etl/19_vtwin_rotor_sprocket.mjs):
-- brake rotor diameter, sprocket tooth count. Keyed by the part number, like
-- oem_part_lengths (013); years / models are the ones the source prints with it
-- (context, not fitment). Several rows for one number = the source prints it more
-- than once (other models, front and rear). Every row names its source + page. The
-- source name is never shown in the app.
-- Removable: DROP TABLE oem_part_sizes.
BEGIN;

CREATE TABLE oem_part_sizes (
  part_size_id serial       PRIMARY KEY,
  oem_number   text         NOT NULL REFERENCES oem_parts ON DELETE CASCADE,
  item         text         NOT NULL CHECK (item IN ('brake_rotor', 'engine_sprocket', 'compensator_sprocket', 'countershaft_sprocket', 'rear_sprocket')),
  measure      text         NOT NULL CHECK (measure IN ('diameter', 'teeth')),
  position     text         NOT NULL DEFAULT '' CHECK (position IN ('front', 'rear', '')),
  value_num    numeric(7,3) NOT NULL,              -- inches for diameter, count for teeth
  value        text         NOT NULL,              -- our wording: '11.5 in', '24 teeth'
  detail       text         NOT NULL DEFAULT '',   -- 'left side, cast or wire wheel'
  years        text         NOT NULL DEFAULT '',   -- as printed with the number: '1972-84 / 1973'
  models       text         NOT NULL DEFAULT '',   -- as printed: 'FLH; FX'
  source       text         NOT NULL,              -- 'vtwin'
  source_ref   text         NOT NULL,              -- 'VT p608'
  confidence   text         NOT NULL CHECK (confidence IN ('high', 'medium')),
  note         text,
  UNIQUE (oem_number, item, position, value_num, detail, source, source_ref)
);
CREATE INDEX ON oem_part_sizes (oem_number);

COMMENT ON TABLE oem_part_sizes IS
  'Stock rotor diameter / sprocket teeth per H-D number from documents. Several rows = the source prints it more than once.';

COMMIT;
