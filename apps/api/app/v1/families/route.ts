import { listFamilies } from '@/lib/familySearch';
import { handle, ok } from '@/lib/http';

// GET /v1/families -> [{key, name, kind: frame|motor, year_start, year_end, models}]
// for the family picker (lib/familySearch.ts).
export async function GET() {
  return handle(async () => ok({ families: await listFamilies() }));
}
