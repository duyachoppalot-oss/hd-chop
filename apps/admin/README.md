# HD Chop admin console (local only)

```
npm --prefix apps/admin install
npm --prefix apps/admin run dev     # http://127.0.0.1:3002
```

Reads `APP_DATABASE_URL` from the repo-root `.env` (the ETL owner role) and binds to 127.0.0.1. Never deploy it.

- **Counter** (`/`): counts, models by platform, concepts, searches that found nothing, open notes, recent overrides.
- **Model** (`/model/FLHR`): every part chain the model takes, grouped by concept, as bars across the years. Shaded header years = model built.
- **Concept** (`/concept/fuel_tank`): one concept across every model; same color = same part chain.
- **Part** (`/part/61268-03`): raw fitment year by year, colored by source, including low-confidence and hidden rows. Fix it here: hide years, add years, rename, set concept.
- **Web** (`/web`): graph of parts, models and concepts; click to expand, double-click to open.
- **Notes / Overrides**: everything in one list; undo or re-apply overrides.

Overrides live in `admin_overrides` (`packages/db/migrations/004_admin.sql`). Saving one applies it and refreshes `fitment_spans` (~7 s); the change is live in the public API right away. The ETL re-applies them at the end of every rebuild: `node scripts/etl/08_overrides.mjs --apply`.
