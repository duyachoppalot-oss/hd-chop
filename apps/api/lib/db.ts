import { Pool, type QueryResultRow } from 'pg';
import { DB_CA } from './dbCert';

// One small pool per server instance. Vercel functions are short-lived and
// concurrent, so keep max low. Connects via APP_DATABASE_URL only (CLAUDE.md
// rule 6): on Vercel that URL is the hdchop_api role (SELECT + insert into
// search_misses).
//
// TLS: the server's certificate is self-signed, so it's pinned as the only
// trusted CA. Its CN is the host name, not the IP we connect to, so the name
// check is skipped; only a server holding that key can finish the handshake.
// Leave sslmode out of APP_DATABASE_URL (it would override this).
declare global {
  // eslint-disable-next-line no-var
  var __hdchopPool: Pool | undefined;
}

function pool(): Pool {
  if (!globalThis.__hdchopPool) {
    if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL is not set');
    globalThis.__hdchopPool = new Pool({
      connectionString: process.env.APP_DATABASE_URL,
      ssl: { ca: DB_CA, rejectUnauthorized: true, checkServerIdentity: () => undefined },
      max: 3,
      idleTimeoutMillis: 10_000,
      statement_timeout: 8_000,
    });
  }
  return globalThis.__hdchopPool;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pool().query<T>(sql, params)).rows;
}
