-- 008: H-D component type and introduction year per part number, from the
-- "Component Types and Introduction Dates" section of the service-portal parts
-- catalogs (scripts/etl/13_component_types.mjs). 06_concepts uses the type to
-- fill concept gaps (data/seed/component_type_concepts.csv).
-- No foreign key to oem_parts on purpose: 02/09/11 rebuild parts, this table
-- stays. Removable: DROP TABLE part_component_types.
BEGIN;

CREATE TABLE part_component_types (
  oem_number   text     PRIMARY KEY,            -- normalized like oem_parts.oem_number
  type_code    text     NOT NULL,               -- '610A1'
  type_name    text     NOT NULL,               -- 'Fuel Tank'
  intro_year   smallint CHECK (intro_year BETWEEN 1903 AND 2035), -- null = 'Unknown' in every book
  books        smallint NOT NULL,               -- catalogs that list the part in this section
  other_types  text[]   NOT NULL DEFAULT '{}'   -- other codes some books give it (rare)
);
CREATE INDEX ON part_component_types (type_code);

COMMIT;
