import type { NextConfig } from 'next';
import fs from 'node:fs';
import path from 'node:path';

// Local only (dev server binds 127.0.0.1). Reads APP_DATABASE_URL from the
// repo-root .env: the ETL owner role, so the console can write notes/overrides.
// Never deploy this app.
const rootEnv = path.resolve(__dirname, '../../.env');
if (!process.env.APP_DATABASE_URL && fs.existsSync(rootEnv)) {
  for (const line of fs.readFileSync(rootEnv, 'utf8').split('\n')) {
    const m = /^APP_DATABASE_URL=(.*)$/.exec(line.trim());
    if (m) process.env.APP_DATABASE_URL = m[1];
  }
}

const nextConfig: NextConfig = { poweredByHeader: false, outputFileTracingRoot: __dirname };

export default nextConfig;
