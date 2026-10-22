-- HD Chop core schema. Target: hdchop database (NOT the source catalog DB).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE vehicles (
  vehicle_id   serial PRIMARY KEY,
  year         smallint NOT NULL CHECK (year BETWEEN 1936 AND 2030),
  model_code   text     NOT NULL,                 -- e.g. FLHR
  model_name   text,                              -- e.g. Road King
  platform     text     NOT NULL,                 -- touring | softail | dyna | sportster | fxr | other
  engine       text,                              -- evo | twin_cam_88 | twin_cam_96 | twin_cam_103 | m8 | ...
  fuel_system  text     NOT NULL DEFAULT 'unknown' CHECK (fuel_system IN ('carb','efi','both','unknown')),
  UNIQUE (year, model_code)
);
CREATE INDEX ON vehicles (model_code);

CREATE TABLE model_aliases (
  alias       text NOT NULL,                      -- lowercase, e.g. 'road king'
  model_code  text NOT NULL,
  year_start  smallint,                           -- null = open-ended
  year_end    smallint,
  PRIMARY KEY (alias, model_code)
);

CREATE TABLE part_concepts (
  concept_id    serial PRIMARY KEY,
  slug          text UNIQUE NOT NULL,             -- fuel_tank
  display_name  text NOT NULL,                    -- Fuel Tank
  category      text,                             -- fuel | body | electrical | ...
  hd_terms      text[] NOT NULL DEFAULT '{}',     -- catalog wording
  user_terms    text[] NOT NULL DEFAULT '{}'      -- what people type
);

CREATE TABLE oem_parts (
  oem_number         text PRIMARY KEY,            -- normalized: no dashes/spaces, uppercase
  oem_display        text NOT NULL,               -- 61xxx-98
  description_clean  text,                        -- our short name, not verbatim catalog text
  concept_id         int REFERENCES part_concepts,
  chain_root         text NOT NULL                -- newest number in supersession chain (self if none)
);
CREATE INDEX ON oem_parts (concept_id);
CREATE INDEX ON oem_parts (chain_root);
CREATE INDEX ON oem_parts USING gin (description_clean gin_trgm_ops);

CREATE TABLE oem_supersession (
  from_oem  text NOT NULL,
  to_oem    text NOT NULL,
  source    text NOT NULL,
  PRIMARY KEY (from_oem, to_oem)
);

CREATE TABLE condition_tags (
  tag       text PRIMARY KEY,                     -- carb
  label     text NOT NULL,                        -- Carbureted
  patterns  text[] NOT NULL                       -- Postgres regexes, use \y for word boundaries
);

CREATE TABLE fitment (
  oem_number        text NOT NULL REFERENCES oem_parts,
  vehicle_id        int  NOT NULL REFERENCES vehicles,
  conditions        text[] NOT NULL DEFAULT '{}', -- sorted + deduped by ETL; values from condition_tags.tag
  condition_source  text NOT NULL DEFAULT 'none'
                    CHECK (condition_source IN ('none','catalog_text','inferred','salvage_verified')),
  source            text NOT NULL,                -- oem_catalog | salvage | ...
  source_ref        text,                         -- source table/row id for traceability
  PRIMARY KEY (oem_number, vehicle_id, conditions)
);
CREATE INDEX ON fitment (vehicle_id);

CREATE TABLE search_misses (
  id          bigserial PRIMARY KEY,
  query       text NOT NULL,
  vehicle_id  int,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Collapse fitment years into continuous spans (gaps-and-islands).
-- concept_id comes from the chain root's part, so it is one value per chain;
-- older numbers in a chain tagged with a different concept can't split spans
-- or break the unique index (needed for REFRESH ... CONCURRENTLY).
CREATE MATERIALIZED VIEW fitment_spans AS
WITH f AS (
  SELECT DISTINCT p.chain_root, r.concept_id, v.model_code, fi.conditions, v.year
  FROM fitment fi
  JOIN oem_parts p USING (oem_number)
  LEFT JOIN oem_parts r ON r.oem_number = p.chain_root
  JOIN vehicles  v USING (vehicle_id)
), g AS (
  SELECT f.*,
         year - ROW_NUMBER() OVER (PARTITION BY chain_root, model_code, conditions ORDER BY year) AS grp
  FROM f
)
SELECT chain_root, concept_id, model_code, conditions,
       MIN(year) AS year_start, MAX(year) AS year_end
FROM g
GROUP BY chain_root, concept_id, model_code, conditions, grp;

CREATE UNIQUE INDEX ON fitment_spans (chain_root, model_code, conditions, year_start);
CREATE INDEX ON fitment_spans (concept_id);

-- Starter condition tags. Expand only after discovery shows real wording.
INSERT INTO condition_tags (tag, label, patterns) VALUES
 ('carb',             'Carbureted',       ARRAY['carb(uret)?(ed|or)?\y']),
 ('efi',              'Fuel injected',    ARRAY['\yefi\y','\yesfi\y','fuel[ -]?inject','\yinjected\y']),
 ('abs',              'ABS',              ARRAY['\yw/ ?abs\y','\ywith abs\y','\yabs models\y']),
 ('non_abs',          'Non-ABS',          ARRAY['non[ -]?abs','w/o ?abs','without abs']),
 ('cvo',              'CVO',              ARRAY['\ycvo\y','screamin.? eagle']),
 ('california',       'California',       ARRAY['\ycalif','\ycal\.? models']),
 ('hdi',              'International',    ARRAY['\yhdi\y','international']),
 ('cable_clutch',     'Cable clutch',     ARRAY['cable clutch']),
 ('hydraulic_clutch', 'Hydraulic clutch', ARRAY['hydraulic clutch']),
 ('cast_wheel',       'Cast wheels',      ARRAY['cast wheel']),
 ('laced_wheel',      'Laced wheels',     ARRAY['laced wheel','spoke wheel','wire wheel']);

COMMIT;
