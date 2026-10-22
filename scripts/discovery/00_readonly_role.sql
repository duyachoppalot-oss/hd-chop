-- One-time setup: read-only login for HD Chop on the source catalog DB.
-- Run once as an admin user against stinkin_catalog (e.g. DBeaver SQL editor, Alt+X).
-- Replace the password, then put the same password in .env (SOURCE_DATABASE_URL).
CREATE ROLE hdchop_ro LOGIN PASSWORD 'REPLACE_WITH_PASSWORD';
GRANT CONNECT ON DATABASE stinkin_catalog TO hdchop_ro;
GRANT USAGE ON SCHEMA public TO hdchop_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hdchop_ro;
-- Tables this admin creates later are readable too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO hdchop_ro;
-- Belt and braces: every session starts read-only.
ALTER ROLE hdchop_ro SET default_transaction_read_only = on;
