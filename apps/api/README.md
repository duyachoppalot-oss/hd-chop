# HD Chop API

Read-only Next.js 15 route handlers over the `hdchop` database (docs/SPEC.md "API").

| Route | Notes |
|---|---|
| `GET /v1/years` | years with at least one vehicle that has fitment |
| `GET /v1/models?year=` | `{model_code, model_name, platform, has_parts}`; `has_parts=false` = no catalog covers it |
| `GET /v1/search?year=&model=&q=[&all=1]` | SPEC search pipeline (`lib/search.ts`). Up to 3 concepts; parts grouped by chain root + conditions; other models only within year ±10 unless `all=1`. No concept → trigram `fallback` + row in `search_misses` |
| `GET /v1/part/:oem` | any number in a chain → newest number, chain, supersession pairs, spans by conditions |

Run locally (reads `APP_DATABASE_URL` from the repo-root `.env`):

```
npm --prefix apps/api install
npm --prefix apps/api run dev        # http://localhost:3001
node apps/api/scripts/gate.mjs       # Phase 2 gate queries
```

Deploy (Hetzner, 5.161.100.126 — same box as Postgres):

```
./scripts/deploy/api.sh > reports/deploy_api.txt 2>&1
node apps/api/scripts/gate.mjs https://hdchop.5.161.100.126.nip.io
```

- `api.sh` rsyncs `apps/api` to `~/hd-chop/api`, builds `hd-chop-api:<git sha>` from the `Dockerfile` (Next.js standalone), and replaces the `hd-chop-api` container (`--network host`, listens on 127.0.0.1:3001, 512 MB, restart unless-stopped). It health-checks `/v1/years` for 20 s and rolls back to the previous image on failure.
- Env: `~/hd-chop/api.env` on the server (chmod 600), `APP_DATABASE_URL=postgres://hdchop_api:…@127.0.0.1:5432/hdchop` and `HDCHOP_APP_KEYS=<key>[,<key>]` — the `hdchop_api` role (`packages/db/roles/hdchop_api.sql`), **no `sslmode`, no quotes**. `lib/db.ts` pins the server's self-signed cert (`lib/dbCert.ts`). Check a URL with `node apps/api/scripts/check-db.mjs API_DATABASE_URL`.
- App key: `apps/api/middleware.ts` answers 401 on `/v1/*` without an `X-App-Key` header listed in `HDCHOP_APP_KEYS` (comma list in `api.env`; rotate = add the new key, ship the app, drop the old one). No keys set: 503 in production, open in local dev. Local dev reads `HDCHOP_APP_KEYS` from the repo-root `.env`; `gate.mjs` sends the first one. CORS: only http://localhost:8081 / :8083, and only when `NODE_ENV !== 'production'`.
- Public: nginx site `hd-chop-api` proxies `hdchop.5.161.100.126.nip.io` → 127.0.0.1:3001; Let's Encrypt cert via certbot, http → https redirect.
- hdchop_api can only log in from the server itself (pg_hba `host all all 127.0.0.1/32`); the internet-wide rule was removed 2026-10-24.
- Responses send `s-maxage=3600, stale-while-revalidate=86400` (data changes only when the ETL runs); misses are `no-store`.
