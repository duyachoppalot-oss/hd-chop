import { query } from '@/lib/db';

// Part names for the viewer's Part box: our part types first, then names already used.
export async function GET() {
  const rows = await query<{ name: string }>(
    `SELECT name FROM (
       SELECT display_name AS name, 0 AS o FROM part_concepts
       UNION SELECT part, 1 FROM catalog_captures WHERE part <> ''
     ) x GROUP BY name ORDER BY min(o), lower(name)`
  );
  return Response.json(rows.map((r) => r.name));
}
