import { useCallback, useEffect, useRef, useState } from 'react';
import { onStoreChange } from '@/lib/store';

export interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /**
   * Whether this query has ever come back. `null` is a legitimate answer —
   * "nobody is signed in" — so the absence of data cannot stand in for
   * "still waiting".
   */
  settled: boolean;
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
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    loading: true,
    error: null,
    settled: false,
  });
  const [nonce, setNonce] = useState(0);

  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    // Only the first load reports `loading`. A refetch keeps the current
    // view on screen, because callers render a placeholder while loading —
    // and swapping the view out unmounts whatever was there. That cost us
    // the "wrong password" message: a failed sign-in triggered a refetch,
    // the sign-in form was replaced by a spinner, and the error it was
    // holding went with it. The person saw nothing happen at all.
    setState((current) => (current.settled ? current : { ...current, loading: true }));

    loadRef
      .current()
      .then((value) => {
        if (!cancelled) setState({ data: value, loading: false, error: null, settled: true });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState((current) => ({
          ...current,
          loading: false,
          settled: true,
          error: cause instanceof Error ? cause.message : 'Something went wrong.',
        }));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  useEffect(() => onStoreChange(reload), [reload]);

  return { data: state.data, loading: state.loading, error: state.error, reload };
}
