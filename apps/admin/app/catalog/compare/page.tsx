import Compare from './compare';

// Catalog captures vs our H-D fitment: change years per part name and family, and the
// lineage of our matching parts on one timeline.
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ part?: string; family?: string }> }) {
  const sp = await searchParams;
  return <Compare initialPart={sp.part ?? ''} initialFamily={sp.family ?? ''} />;
}
