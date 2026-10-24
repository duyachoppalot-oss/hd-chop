import { useCallback, useEffect, useState } from 'react';

// Runs fn on mount and whenever deps change; aborts the previous request.
export function useApi<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fn(ac.signal)
      .then((d) => !ac.signal.aborted && setData(d))
      .catch((e: Error) => !ac.signal.aborted && e.name !== 'AbortError' && setError(e.message))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const retry = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, retry };
}
