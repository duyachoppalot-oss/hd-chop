import { WebGraph } from '@/components/WebGraph';

export default async function WebPage({ searchParams }: { searchParams: Promise<{ seed?: string }> }) {
  const seed = (await searchParams).seed ?? 'model:FLHR';
  return (
    <>
      <h1>Web</h1>
      <p className="muted">
        Click a node to pull in its connections; double-click to open its page. Parts link to the models they fit (edge = years),
        the parts they replaced, and their concept. Expanding a concept shows its parts for the models already on screen.
      </p>
      <WebGraph seed={seed} />
    </>
  );
}
