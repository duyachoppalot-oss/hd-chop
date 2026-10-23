// Connects the way lib/db.ts does (pinned server cert) and reports the role,
// TLS state and what it may write. Never prints the URL.
// Usage: node scripts/check-db.mjs [ENV_VAR]   (default APP_DATABASE_URL; reads the repo-root .env)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] ?? 'APP_DATABASE_URL';
let url = process.env[name];
if (!url) {
  const env = fs.readFileSync(path.resolve(here, '../../../.env'), 'utf8');
  url = new RegExp(`^${name}=(.*)$`, 'm').exec(env)?.[1]?.trim();
}
if (!url) { console.error(`${name} not set`); process.exit(1); }
const ca = /`([\s\S]+?)`/.exec(fs.readFileSync(path.resolve(here, '../lib/dbCert.ts'), 'utf8'))[1];

const c = new pg.Client({ connectionString: url, ssl: { ca, rejectUnauthorized: true, checkServerIdentity: () => undefined } });
await c.connect();
const [r] = (await c.query(`SELECT current_user AS role, s.ssl, s.version AS tls FROM pg_stat_ssl s WHERE s.pid = pg_backend_pid()`)).rows;
const read = (await c.query(`SELECT count(*)::int AS n FROM fitment_spans`)).rows[0].n;
const can = async (sql) => {
  await c.query('BEGIN');
  try { await c.query(sql); return 'allowed'; } catch (e) { return e.code === '42501' ? 'denied' : `error ${e.code}`; } finally { await c.query('ROLLBACK'); }
};
console.log({
  env: name,
  role: r.role,
  ssl: r.ssl,
  tls: r.tls,
  read_fitment_spans: read,
  insert_search_misses: await can(`INSERT INTO search_misses (query) VALUES ('check-db')`),
  insert_fitment: await can(`INSERT INTO fitment (oem_number, vehicle_id, source, source_ref, confidence) SELECT oem_number, 1, 'x', 'x', 'low' FROM oem_parts LIMIT 1`),
  update_oem_parts: await can(`UPDATE oem_parts SET description_clean = description_clean WHERE false`),
});
await c.end();
