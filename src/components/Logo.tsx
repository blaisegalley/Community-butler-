interface LogoMarkProps {
  className?: string;
}

/**
 * Butler glyph — simple roof/shoulders silhouette. Uses stroke="currentColor"
 * (rather than a hardcoded white) so the same mark works on both the dark
 * hero and the light subpages; wrap it in a white-text context to match the
 * hero's exact look.
 */
export function LogoMark({ className = '' }: LogoMarkProps) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`sm:w-[32px] sm:h-[32px] ${className}`}
    >
      <path d="M4 21v-7a8 8 0 0 1 16 0v7" />
      <path d="M4 21h3v-5H4z" />
      <path d="M17 16h3v5h-3z" />
      <path d="M9 21v-3a3 3 0 0 1 6 0v3" />
    </svg>
  );
}

interface WordmarkProps {
  className?: string;
}

export function Wordmark({ className = '' }: WordmarkProps) {
  return (
    <span className={`text-[22px] sm:text-[26px] font-medium leading-none tracking-[-0.02em] ${className}`}>
      Community Butler
    </span>
  );
}
