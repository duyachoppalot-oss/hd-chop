-- API login for apps/api (SPEC: read-only DB role). Run once as postgres
-- against the hdchop database. Run 2026-10-23 without the PASSWORD clause;
-- Laken sets it with \password hdchop_api.
--   sudo -u postgres psql -d hdchop -f hdchop_api.sql
-- The API runs on the DB server (apps/api/README.md), so it logs in over
-- 127.0.0.1 via the existing `host all all 127.0.0.1/32` rule. The
-- internet-wide `hostssl hdchop hdchop_api 0.0.0.0/0` rule added for Vercel
-- on 2026-10-23 was removed 2026-10-24.
CREATE ROLE hdchop_api LOGIN PASSWORD 'REPLACE_WITH_PASSWORD' CONNECTION LIMIT 30;
GRANT CONNECT ON DATABASE hdchop TO hdchop_api;
GRANT USAGE ON SCHEMA public TO hdchop_api;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hdchop_api;   -- incl. fitment_spans
-- The only write: logging queries that found no concept.
GRANT INSERT ON search_misses TO hdchop_api;
GRANT USAGE ON SEQUENCE search_misses_id_seq TO hdchop_api;
-- Tables the ETL owner creates later stay readable.
ALTER DEFAULT PRIVILEGES FOR ROLE hdchop_app IN SCHEMA public GRANT SELECT ON TABLES TO hdchop_api;
ALTER ROLE hdchop_api SET statement_timeout = '8s';
