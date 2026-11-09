import { RefObject, useEffect, useRef, useState } from 'react';

/**
 * True once the element has scrolled into view, and it stays true: a section
 * that re-hid itself every time it left the screen would replay its entrance
 * on every scroll back up.
 */
export function useInView<T extends Element>(): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      // Wait until it is a little way up the screen, so the motion happens
      // where the eye already is rather than at the very bottom edge.
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  return [ref, inView];
}
