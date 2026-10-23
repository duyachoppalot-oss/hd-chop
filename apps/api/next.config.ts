import type { NextConfig } from 'next';
import fs from 'node:fs';
import path from 'node:path';

// Local dev reads the repo-root .env (APP_DATABASE_URL). On Vercel the variable
// is set in the project and this does nothing.
const rootEnv = path.resolve(__dirname, '../../.env');
if (!process.env.APP_DATABASE_URL && fs.existsSync(rootEnv)) {
  for (const line of fs.readFileSync(rootEnv, 'utf8').split('\n')) {
    const m = /^APP_DATABASE_URL=(.*)$/.exec(line.trim());
    if (m) process.env.APP_DATABASE_URL = m[1];
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

export default nextConfig;
