import { useEffect, useState } from 'react';

/**
 * Tracks a media query's match state, updating on viewport changes.
 * Returns false during SSR/first paint if unavailable — callers that gate
 * expensive work (like mounting a WebGL scene) should treat that as "don't
 * mount yet" rather than a real false.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}
