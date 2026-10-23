-- Provenance + confidence for the assembled multi-source ETL (docs/ETL_PLAN.md).
-- Run after 001 on an empty hdchop DB: the NOT NULL columns have no default on
-- purpose, so every ETL insert has to say where a value came from.
BEGIN;

-- Where the part number came from: read as-is, or rebuilt from a truncated "NNNNN-".
ALTER TABLE oem_parts
  ADD COLUMN number_source text NOT NULL
  CHECK (number_source IN ('extracted','repaired_same_year','repaired_other_year'));

-- high = reference + oem_fitment agree on number and year, number not repaired
-- medium = reference only, number extracted
-- low = repaired number; kept for review, hidden from fitment_spans
ALTER TABLE fitment
  ADD COLUMN confidence text NOT NULL
  CHECK (confidence IN ('high','medium','low'));
ALTER TABLE fitment ALTER COLUMN source_ref SET NOT NULL;

-- Platforms only; engine eras (evolution, twin_cam, ...) belong in `engine`.
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_platform_check
  CHECK (platform IN ('touring','softail','dyna','sportster','fxr','trike',
                      'v_rod','street','revolution_max','vintage'));
COMMENT ON COLUMN vehicles.platform IS
  'touring | softail | dyna | sportster | fxr | trike | v_rod | street | revolution_max | vintage';
COMMENT ON COLUMN vehicles.engine IS
  'hd_engine_types.engine_key from the source DB (knucklehead, panhead, shovelhead, evolution_bigtwin, twin_cam, milwaukee_eight, ironhead, evolution_sportster, revolution, revolution_max, ...); null when the year is ambiguous';

-- Same view as 001, minus low-confidence fitment. Low rows stay queryable in `fitment`.
DROP MATERIALIZED VIEW fitment_spans;
CREATE MATERIALIZED VIEW fitment_spans AS
WITH f AS (
  SELECT DISTINCT p.chain_root, r.concept_id, v.model_code, fi.conditions, v.year
  FROM fitment fi
  JOIN oem_parts p USING (oem_number)
  LEFT JOIN oem_parts r ON r.oem_number = p.chain_root
  JOIN vehicles  v USING (vehicle_id)
  WHERE fi.confidence IN ('high','medium')
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

-- Discovery: 0 hits for cvo, 10 for the clutch tags (ETL_PLAN step 04).
DELETE FROM condition_tags WHERE tag IN ('cvo','cable_clutch','hydraulic_clutch');

COMMIT;
