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

Deploy: Vercel project rooted at `apps/api`; `APP_DATABASE_URL` = the `hdchop_api` role (`packages/db/roles/hdchop_api.sql`), with SSL. Responses cache at the edge for an hour (data changes only when the ETL runs); misses are `no-store`.
