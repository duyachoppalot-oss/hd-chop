// scripts/etl/08_overrides.mjs
//
// Last ETL step: re-applies the admin console's active overrides
// (packages/db/migrations/004_admin.sql) on top of the rebuilt fitment and
// oem_parts, then refreshes fitment_spans. Run after 07.
//
// Dry run lists each active override and how many rows it would touch now.
//
// Usage:
//   node scripts/etl/08_overrides.mjs            (dry-run, prints + writes report only)
//   node scripts/etl/08_overrides.mjs --apply    (applies + refreshes fitment_spans)

import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const app = new pg.Pool({ connectionString: process.env.APP_DATABASE_URL });

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
}

// Rows each kind would touch, read-only: [sql, params].
const PREVIEW = {
  hide_fitment: (o) => [
    `SELECT count(*)::int AS n FROM fitment f JOIN vehicles v USING (vehicle_id)
     WHERE f.oem_number = $1 AND f.source <> 'admin' AND ($2::text IS NULL OR v.model_code = $2)
       AND v.year BETWEEN coalesce($3::int, 0) AND coalesce($4::int, 9999)`,
    [o.oem_number, o.model_code, o.year_start, o.year_end],
  ],
  add_fitment: (o) => [
    `SELECT count(*)::int AS n FROM vehicles v
     WHERE v.model_code = $2 AND v.year BETWEEN $3 AND $4
       AND EXISTS (SELECT 1 FROM oem_parts p WHERE p.oem_number = $1)`,
    [o.oem_number, o.model_code, o.year_start, o.year_end],
  ],
  rename_part: (o) => [
    `SELECT count(*)::int AS n FROM oem_parts WHERE oem_number = $1 AND description_clean IS DISTINCT FROM $2`,
    [o.oem_number, o.value],
  ],
  set_concept: (o) => [
    `SELECT count(*)::int AS n FROM oem_parts p LEFT JOIN part_concepts c USING (concept_id)
     WHERE p.oem_number = $1 AND coalesce(c.slug, '') IS DISTINCT FROM $2`,
    [o.oem_number, o.value],
  ],
};

async function main() {
  const overrides = (await app.query(`SELECT * FROM admin_overrides WHERE active ORDER BY override_id`)).rows;
  const lines = [`08_overrides ${APPLY ? 'APPLY' : 'DRY RUN'} ${new Date().toISOString()}`, `active overrides: ${overrides.length}`, ''];
  const byKind = {};
  for (const o of overrides) {
    const n = (await app.query(...PREVIEW[o.kind](o))).rows[0].n;
    byKind[o.kind] = (byKind[o.kind] ?? 0) + 1;
    if (lines.length < 40) {
      const years = o.year_start || o.year_end ? ` ${o.year_start ?? '…'}–${o.year_end ?? '…'}` : '';
      lines.push(`  #${o.override_id} ${o.kind} ${o.oem_number} ${o.model_code ?? 'all models'}${years}${o.value != null ? ` → "${o.value}"` : ''}: ${n} rows now`);
    }
  }
  lines.splice(2, 0, ...Object.entries(byKind).map(([k, n]) => `  ${k}: ${n}`));

  const reportPath = path.join('reports', `08_overrides_${timestamp()}.txt`);
  fs.mkdirSync('reports', { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\nReport written to ${reportPath}`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write to APP_DATABASE_URL.');
    return;
  }
  const res = (await app.query(`SELECT * FROM admin_apply_overrides()`)).rows;
  console.log(`Applied ${res.length} overrides (${res.reduce((s, r) => s + r.affected, 0)} rows).`);
  const t = Date.now();
  await app.query('REFRESH MATERIALIZED VIEW CONCURRENTLY fitment_spans');
  console.log(`Refreshed fitment_spans in ${Date.now() - t} ms.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => app.end());
