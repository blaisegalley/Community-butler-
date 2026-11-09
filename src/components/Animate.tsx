import { ReactNode } from 'react';
import { useInView } from '@/hooks/useInView';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type Direction = 'up' | 'down' | 'left' | 'right' | 'scale';

interface AnimateProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  direction?: Direction;
}

/**
 * Reveals its children the first time they scroll into view. It used to play
 * on page load, which meant everything below the hero had finished animating
 * long before anyone scrolled down to see it.
 */
export default function Animate({
  children,
  delay = 0,
  className = '',
  direction = 'up',
}: AnimateProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      className={`reveal reveal-${direction} ${inView ? 'is-shown' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
