-- 012: documented chassis sizes per vehicle (scripts/etl/16_chassis_specs.mjs):
-- wheel (rim diameter x width) and tire size front/rear, front axle diameter, fork
-- tube diameter (handlebar diameter has a slot; no source yet). One row per fact a
-- source states; several rows for one bike + item = the stock variants the source
-- lists (1987-2017 FLSTC rear: 150/80B16 blackwall or MU85B16 whitewall). Every row
-- names its document + page. source_rank 1 = H-D document, 2 = vendor catalog
-- (V-Twin, DATA_RIGHTS); the ETL drops a rank-2 row where a rank-1 row covers the
-- same bike + item + position. The source name is never shown in the app.
-- Removable: DROP TABLE vehicle_chassis_specs.
BEGIN;

CREATE TABLE vehicle_chassis_specs (
  chassis_spec_id serial   PRIMARY KEY,
  vehicle_id      int      NOT NULL REFERENCES vehicles ON DELETE CASCADE,
  item            text     NOT NULL CHECK (item IN ('wheel', 'tire', 'axle', 'fork_tube', 'handlebar')),
  position        text     NOT NULL DEFAULT '' CHECK (position IN ('front', 'rear', '')),
  value           text     NOT NULL,          -- our wording: '19 x 2.15 in', '100/90-19', '3/4 in', '25 mm', '41 mm'
  size_mm         numeric(6,2),               -- diameter in mm (wheel: rim diameter) for sorting / comparing
  source          text     NOT NULL,          -- 'hd-tire-guide-2020', 'vtwin-catalog-2025'
  source_rank     smallint NOT NULL CHECK (source_rank IN (1, 2)),
  source_ref      text     NOT NULL,          -- page (+ printed model line)
  note            text,
  UNIQUE (vehicle_id, item, position, source, value)
);
CREATE INDEX ON vehicle_chassis_specs (vehicle_id);

COMMENT ON TABLE vehicle_chassis_specs IS
  'Wheel / tire / axle / fork tube / handlebar sizes per vehicle from documents. Several rows = stock variants.';

COMMIT;
