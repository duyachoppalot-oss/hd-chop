# HD Chop

Harley-Davidson part fitment lookup: pick your bike, type what you call the part, see what fits and which years used the same part.

Start with `CLAUDE.md`, then `docs/ROADMAP.md`. Current phase: **Phase 0: Discovery**.

```
apps/mobile            Expo app (to scaffold)
apps/api               Next.js API (to scaffold)
packages/db/migrations Schema
scripts/discovery      Read-only SQL against the source DB
scripts/etl            Source → hdchop loaders (dry-run by default)
data/seed              Starter concept + model alias lists (validate against real data)
docs/                  Spec, data rights, roadmap, handoff log
reports/               Dry-run and discovery output
```
