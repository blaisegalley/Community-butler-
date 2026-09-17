import { CSSProperties, useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface AnimatedHeadingProps {
  text: string;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  duration?: number;
  /** Stagger between lines. */
  lineDelay?: number;
}

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Splits `text` on \n into lines and fades each line up as a whole. Animating
 * per character read as decoration rather than meaning, and staggering 36
 * letters held the headline mid-animation for close to two seconds.
 */
export default function AnimatedHeading({
  text,
  className = '',
  style,
  delay = 0,
  duration = 400,
  lineDelay = 80,
}: AnimatedHeadingProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const lines = text.split('\n');

  if (reduceMotion) {
    return (
      <h1 className={className} style={style}>
        {lines.map((line, i) => (
          <span key={i} style={{ display: 'block' }}>
            {line}
          </span>
        ))}
      </h1>
    );
  }

  return (
    <h1 className={className} style={style}>
      {lines.map((line, i) => (
        <span
          key={i}
          style={{
            display: 'block',
            opacity: animate ? 1 : 0,
            transform: animate ? 'translateY(0)' : 'translateY(14px)',
            transition: `opacity ${duration}ms ${EASE}, transform ${duration}ms ${EASE}`,
            transitionDelay: `${i * lineDelay}ms`,
          }}
        >
          {line}
        </span>
      ))}
    </h1>
  );
}
