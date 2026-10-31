import Lineage from './lineage';

// Part lineage: where a part came from and what replaced it, on one timeline / web.
export default async function LineagePage({ searchParams }: { searchParams: Promise<{ oem?: string; family?: string; view?: string }> }) {
  const sp = await searchParams;
  return <Lineage initialOem={sp.oem ?? ''} initialFamily={sp.family ?? ''} initialView={sp.view === 'web' ? 'web' : 'timeline'} />;
}
