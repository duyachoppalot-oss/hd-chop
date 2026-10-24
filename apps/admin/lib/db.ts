import { Pool, type QueryResultRow } from 'pg';

// Same connection as the ETL scripts (APP_DATABASE_URL, owner role).
declare global {
  // eslint-disable-next-line no-var
  var __hdchopAdminPool: Pool | undefined;
}

function pool(): Pool {
  if (!globalThis.__hdchopAdminPool) {
    if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL is not set (repo-root .env)');
    globalThis.__hdchopAdminPool = new Pool({
      connectionString: process.env.APP_DATABASE_URL,
      max: 4,
      idleTimeoutMillis: 30_000,
      statement_timeout: 60_000,
    });
  }
  return globalThis.__hdchopAdminPool;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pool().query<T>(sql, params)).rows;
}

// Normalized part number: no dashes/spaces, uppercase (oem_parts.oem_number).
export const normOem = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');

export const MODEL_RE = /^[A-Z][A-Z0-9-]{0,14}$/;
