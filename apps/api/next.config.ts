import type { NextConfig } from 'next';
import fs from 'node:fs';
import path from 'node:path';

// Local dev reads the repo-root .env (APP_DATABASE_URL, HDCHOP_APP_KEYS). In the
// container the variables come from --env-file and this does nothing.
const rootEnv = path.resolve(__dirname, '../../.env');
if (fs.existsSync(rootEnv)) {
  for (const line of fs.readFileSync(rootEnv, 'utf8').split('\n')) {
    const m = /^(APP_DATABASE_URL|HDCHOP_APP_KEYS)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-contained server for the Docker image on the Hetzner box (scripts/deploy/api.sh).
  output: 'standalone',
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
