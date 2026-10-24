-- Admin console (apps/admin, local only): notes and overrides.
--
-- Overrides are hand fixes kept apart from the ETL output. The ETL rebuilds
-- fitment/oem_parts from the sources; 08_overrides.mjs (and the console)
-- re-applies every active override afterwards, so fixes survive rebuilds and
-- can be undone:
--   hide_fitment  move matching fitment rows (part, model or all models, years
--                 or all years) into fitment_hidden. API and fitment_spans
--                 never see them; undo moves them back.
--   add_fitment   insert fitment for an existing part on existing vehicles,
--                 source = 'admin', source_ref = 'admin_overrides:<id>'.
--   rename_part   set oem_parts.description_clean; `original` keeps the name
--                 it replaced, for undo.
--   set_concept   set oem_parts.concept_id by slug ('' = none); `original`
--                 keeps the slug it replaced.
-- oem_number / model_code carry no foreign keys on purpose: an override must
-- outlive a rebuild that drops and re-adds its part.
BEGIN;

CREATE TABLE admin_notes (
  note_id      serial PRIMARY KEY,
  target_kind  text NOT NULL CHECK (target_kind IN ('part','model','vehicle','concept','general')),
  target_key   text NOT NULL,          -- part: oem_number; model: model_code; vehicle: 'YEAR:MODEL'; concept: slug; general: ''
  body         text NOT NULL,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON admin_notes (target_kind, target_key);

CREATE TABLE admin_overrides (
  override_id  serial PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('hide_fitment','add_fitment','rename_part','set_concept')),
  oem_number   text NOT NULL,
  model_code   text,                   -- hide: null = every model; add: required
  year_start   smallint,               -- hide: null = open-ended; add: required
  year_end     smallint,
  conditions   text[] NOT NULL DEFAULT '{}',  -- add only
  value        text,                   -- rename: new name; set_concept: slug or ''
  original     text,                   -- rename/set_concept: value it replaced
  reason       text,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  applied_at   timestamptz,
  last_result  text,
  CHECK (kind <> 'add_fitment' OR (model_code IS NOT NULL AND year_start IS NOT NULL AND year_end IS NOT NULL)),
  CHECK (kind NOT IN ('rename_part','set_concept') OR value IS NOT NULL)
);
CREATE INDEX ON admin_overrides (oem_number);

CREATE TABLE fitment_hidden (
  oem_number        text NOT NULL,
  vehicle_id        int  NOT NULL,
  conditions        text[] NOT NULL,
  condition_source  text NOT NULL,
  source            text NOT NULL,
  source_ref        text NOT NULL,
  confidence        text NOT NULL,
  override_id       int  NOT NULL REFERENCES admin_overrides ON DELETE CASCADE,
  PRIMARY KEY (oem_number, vehicle_id, conditions, override_id)
);
CREATE INDEX ON fitment_hidden (override_id);

-- Apply one override (no-op when inactive). Returns rows affected.
CREATE FUNCTION admin_apply_override(oid int) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  o admin_overrides;
  n int := 0;
  cur text;
BEGIN
  SELECT * INTO o FROM admin_overrides WHERE override_id = oid;
  IF NOT FOUND OR NOT o.active THEN RETURN 0; END IF;

  IF o.kind = 'hide_fitment' THEN
    WITH moved AS (
      DELETE FROM fitment f USING vehicles v
      WHERE v.vehicle_id = f.vehicle_id AND f.oem_number = o.oem_number AND f.source <> 'admin'
        AND (o.model_code IS NULL OR v.model_code = o.model_code)
        AND v.year BETWEEN coalesce(o.year_start, 0) AND coalesce(o.year_end, 9999)
      RETURNING f.*
    )
    INSERT INTO fitment_hidden (oem_number, vehicle_id, conditions, condition_source, source, source_ref, confidence, override_id)
    SELECT oem_number, vehicle_id, conditions, condition_source, source, source_ref, confidence, o.override_id FROM moved
    ON CONFLICT (oem_number, vehicle_id, conditions, override_id) DO UPDATE
      SET condition_source = EXCLUDED.condition_source, source = EXCLUDED.source,
          source_ref = EXCLUDED.source_ref, confidence = EXCLUDED.confidence;
    SELECT count(*) INTO n FROM fitment_hidden WHERE override_id = oid;

  ELSIF o.kind = 'add_fitment' THEN
    INSERT INTO fitment (oem_number, vehicle_id, conditions, condition_source, source, source_ref, confidence)
    SELECT o.oem_number, v.vehicle_id, o.conditions,
           CASE WHEN cardinality(o.conditions) > 0 THEN 'inferred' ELSE 'none' END,
           'admin', 'admin_overrides:' || o.override_id, 'high'
    FROM vehicles v
    WHERE v.model_code = o.model_code AND v.year BETWEEN o.year_start AND o.year_end
      AND EXISTS (SELECT 1 FROM oem_parts p WHERE p.oem_number = o.oem_number)
    ON CONFLICT DO NOTHING;
    SELECT count(*) INTO n FROM fitment WHERE source = 'admin' AND source_ref = 'admin_overrides:' || oid;

  ELSIF o.kind = 'rename_part' THEN
    SELECT description_clean INTO cur FROM oem_parts WHERE oem_number = o.oem_number;
    IF FOUND AND cur IS DISTINCT FROM o.value THEN
      UPDATE admin_overrides SET original = cur WHERE override_id = oid;
      UPDATE oem_parts SET description_clean = o.value WHERE oem_number = o.oem_number;
      n := 1;
    END IF;

  ELSIF o.kind = 'set_concept' THEN
    SELECT coalesce(c.slug, '') INTO cur
    FROM oem_parts p LEFT JOIN part_concepts c USING (concept_id) WHERE p.oem_number = o.oem_number;
    IF FOUND AND cur IS DISTINCT FROM o.value THEN
      UPDATE admin_overrides SET original = cur WHERE override_id = oid;
      UPDATE oem_parts SET concept_id = (SELECT concept_id FROM part_concepts WHERE slug = o.value)
      WHERE oem_number = o.oem_number;
      n := 1;
    END IF;
  END IF;

  UPDATE admin_overrides SET applied_at = now(), last_result = n || ' rows' WHERE override_id = oid;
  RETURN n;
END $$;

-- Re-apply every active override, oldest first. Run after the ETL (08_overrides.mjs),
-- then refresh fitment_spans.
CREATE FUNCTION admin_apply_overrides() RETURNS TABLE (override_id int, kind text, affected int)
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  -- Hidden copies of parts/vehicles a rebuild dropped can't be restored; forget them.
  DELETE FROM fitment_hidden h
  WHERE NOT EXISTS (SELECT 1 FROM oem_parts p WHERE p.oem_number = h.oem_number)
     OR NOT EXISTS (SELECT 1 FROM vehicles v WHERE v.vehicle_id = h.vehicle_id);
  FOR r IN SELECT o.override_id, o.kind FROM admin_overrides o WHERE o.active ORDER BY o.override_id LOOP
    override_id := r.override_id; kind := r.kind;
    affected := admin_apply_override(r.override_id);
    RETURN NEXT;
  END LOOP;
END $$;

-- Undo one override: deactivate it and put back what it changed. Other active
-- hides are re-applied in case they cover rows this one had taken.
CREATE FUNCTION admin_undo_override(oid int) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  o admin_overrides;
  n int := 0;
BEGIN
  SELECT * INTO o FROM admin_overrides WHERE override_id = oid;
  IF NOT FOUND THEN RETURN 0; END IF;
  UPDATE admin_overrides SET active = false, last_result = 'undone' WHERE override_id = oid;

  IF o.kind = 'hide_fitment' THEN
    INSERT INTO fitment (oem_number, vehicle_id, conditions, condition_source, source, source_ref, confidence)
    SELECT h.oem_number, h.vehicle_id, h.conditions, h.condition_source, h.source, h.source_ref, h.confidence
    FROM fitment_hidden h
    WHERE h.override_id = oid
      AND EXISTS (SELECT 1 FROM oem_parts p WHERE p.oem_number = h.oem_number)
      AND EXISTS (SELECT 1 FROM vehicles v WHERE v.vehicle_id = h.vehicle_id)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    DELETE FROM fitment_hidden WHERE override_id = oid;
    PERFORM admin_apply_override(x.override_id)
    FROM admin_overrides x WHERE x.active AND x.kind = 'hide_fitment' AND x.oem_number = o.oem_number;

  ELSIF o.kind = 'add_fitment' THEN
    DELETE FROM fitment WHERE source = 'admin' AND source_ref = 'admin_overrides:' || oid;
    GET DIAGNOSTICS n = ROW_COUNT;

  ELSIF o.kind = 'rename_part' THEN
    UPDATE oem_parts SET description_clean = o.original
    WHERE oem_number = o.oem_number AND description_clean IS NOT DISTINCT FROM o.value;
    GET DIAGNOSTICS n = ROW_COUNT;

  ELSIF o.kind = 'set_concept' THEN
    UPDATE oem_parts p SET concept_id = (SELECT concept_id FROM part_concepts WHERE slug = o.original)
    WHERE p.oem_number = o.oem_number
      AND coalesce((SELECT slug FROM part_concepts c WHERE c.concept_id = p.concept_id), '') = o.value;
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  RETURN n;
END $$;

COMMIT;
