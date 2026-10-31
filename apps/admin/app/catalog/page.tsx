import { CATALOGS } from '@/lib/catalog';
import CatalogViewer from './viewer';

// Catalog viewer: page image + drag a box to capture the words in it as a fact to document.
export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const p = Number((await searchParams).p);
  const page = Number.isInteger(p) && p >= 1 && p <= CATALOGS.vtwin.pages ? p : 1;
  return <CatalogViewer catalog="vtwin" title={CATALOGS.vtwin.title} sections={[...CATALOGS.vtwin.sections]} initialPage={page} />;
}
