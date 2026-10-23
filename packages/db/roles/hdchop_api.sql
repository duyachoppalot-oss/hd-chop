-- API login for apps/api (SPEC: read-only DB role). Run once as postgres
-- against the hdchop database; NOT run yet (needs Laken's go-ahead).
--   sudo -u postgres psql -d hdchop -f hdchop_api.sql
-- Then set APP_DATABASE_URL on Vercel to this role (CLAUDE.md rule 6) with
-- sslmode (server has ssl = on), and add to pg_hba.conf:
--   hostssl hdchop hdchop_api 0.0.0.0/0 scram-sha-256
-- (Vercel functions have no fixed IPs.)
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
