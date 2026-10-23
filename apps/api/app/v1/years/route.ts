import { query } from '@/lib/db';
import { handle, ok } from '@/lib/http';

// Years that have at least one vehicle with fitment.
export async function GET() {
  return handle(async () => {
    const rows = await query<{ year: number }>(
      `SELECT DISTINCT v.year FROM vehicles v
       WHERE EXISTS (SELECT 1 FROM fitment f WHERE f.vehicle_id = v.vehicle_id)
       ORDER BY v.year DESC`
    );
    return ok({ years: rows.map((r) => r.year) });
  });
}
