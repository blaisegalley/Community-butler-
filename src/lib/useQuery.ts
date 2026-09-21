import { useCallback, useEffect, useRef, useState } from 'react';
import { onStoreChange } from '@/lib/store';

export interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Runs an async read and re-runs it whenever the store changes.
 *
 * The data layer went from synchronous localStorage to a real database,
 * which means every screen now has a moment where it has asked and not yet
 * been answered, and a moment where the answer is "the network is down".
 * This gives both of those a single shape so each screen doesn't invent
 * its own.
 *
 * `deps` decides when the query itself changes (a different butler id, for
 * instance) — `load` is not compared, so an inline arrow is fine.
 */
export function useQuery<T>(load: () => Promise<T>, deps: unknown[] = []): QueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadRef
      .current()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Something went wrong.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  useEffect(() => onStoreChange(reload), [reload]);

  return { data, loading, error, reload };
}
