import type { NextConfig } from 'next';
import fs from 'node:fs';
import path from 'node:path';

// Local dev reads the repo-root .env (APP_DATABASE_URL). In the container the
// variable comes from --env-file and this does nothing.
const rootEnv = path.resolve(__dirname, '../../.env');
if (!process.env.APP_DATABASE_URL && fs.existsSync(rootEnv)) {
  for (const line of fs.readFileSync(rootEnv, 'utf8').split('\n')) {
    const m = /^APP_DATABASE_URL=(.*)$/.exec(line.trim());
    if (m) process.env.APP_DATABASE_URL = m[1];
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-contained server for the Docker image on the Hetzner box (scripts/deploy/api.sh).
  output: 'standalone',
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
