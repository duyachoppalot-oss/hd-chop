-- 006: documented engine / transmission specs per vehicle (scripts/etl/12_vehicle_specs.mjs).
-- One row per option a source states for that bike: when H-D sold two engines in
-- one model-year (1978-80 FLH 74 and 80 ci; 1981-84 FXE; 1979 1/2 FXS) the vehicle
-- has two rows. Every row names the H-D document and page it came from.
-- Removable: DROP TABLE vehicle_specs.
BEGIN;

CREATE TABLE vehicle_specs (
  spec_id             serial   PRIMARY KEY,
  vehicle_id          int      NOT NULL REFERENCES vehicles ON DELETE CASCADE,
  displacement_ci     numeric(5,1) CHECK (displacement_ci > 0),     -- 53.9, 74, 80
  displacement_cc     smallint CHECK (displacement_cc > 0),         -- 883, 1200, 1340
  transmission_speeds smallint CHECK (transmission_speeds BETWEEN 3 AND 6), -- null = source doesn't say
  horsepower          text,                                         -- as printed: '55 hp @ 6,300 rpm'
  compression_ratio   text,                                         -- as printed: '9.0:1'
  mid_year_change     boolean  NOT NULL DEFAULT false,              -- source year is "1/2" (e.g. FXS 1979 1/2)
  note                text,                                         -- short paraphrase of the source row's remarks
  source              text     NOT NULL,                            -- e.g. '99427-84:model-history'
  source_ref          text     NOT NULL,                            -- printed row label + page, e.g. 'FLH 80 CLASSIC, p11'
  UNIQUE NULLS NOT DISTINCT (vehicle_id, source, displacement_ci, transmission_speeds)
);
CREATE INDEX ON vehicle_specs (vehicle_id);

COMMENT ON TABLE vehicle_specs IS
  'Engine size / transmission per vehicle from H-D documents. Several rows = options sold that year.';

COMMIT;
