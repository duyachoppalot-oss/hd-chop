import { CATALOGS, isCatalog, pageImage } from '@/lib/catalog';

// Page image (PNG, rendered once with pdftoppm and cached).
export async function GET(_req: Request, { params }: { params: Promise<{ catalog: string; page: string }> }) {
  const { catalog, page: p } = await params;
  const page = Number(p);
  if (!isCatalog(catalog) || !Number.isInteger(page) || page < 1 || page > CATALOGS[catalog].pages)
    return new Response('unknown catalog or page', { status: 404 });
  const png = await pageImage(catalog, page);
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=86400' } });
}
