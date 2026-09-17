import { CSSProperties, useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface AnimatedHeadingProps {
  text: string;
  className?: string;
  style?: CSSProperties;
  initialDelay?: number;
  charDelay?: number;
  charDuration?: number;
}

/** Splits `text` on \n into lines, then each line into characters, and
 * fades/slides each one in with a per-character stagger. */
export default function AnimatedHeading({
  text,
  className = '',
  style,
  initialDelay = 200,
  charDelay = 30,
  charDuration = 500,
}: AnimatedHeadingProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), initialDelay);
    return () => clearTimeout(timer);
  }, [initialDelay]);

  const lines = text.split('\n');

  if (reduceMotion) {
    return (
      <h1 className={className} style={style}>
        {lines.map((line, lineIndex) => (
          <span key={lineIndex} style={{ display: 'block' }}>
            {line}
          </span>
        ))}
      </h1>
    );
  }

  return (
    <h1 className={className} style={style}>
      {lines.map((line, lineIndex) => (
        <span key={lineIndex} style={{ display: 'block' }}>
          {line.split('').map((char, charIndex) => {
            const delay = lineIndex * line.length * charDelay + charIndex * charDelay;
            return (
              <span
                key={charIndex}
                style={{
                  display: 'inline-block',
                  opacity: animate ? 1 : 0,
                  transform: animate ? 'translateX(0)' : 'translateX(-18px)',
                  transition: `opacity ${charDuration}ms ease, transform ${charDuration}ms ease`,
                  transitionDelay: `${delay}ms`,
                }}
              >
                {char === ' ' ? ' ' : char}
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
