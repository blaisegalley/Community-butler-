import { useState } from 'react';
import AnimatedHeading from '@/components/AnimatedHeading';
import FadeIn from '@/components/FadeIn';
import { withBase } from '@/lib/url';

// Alternates hero background between these clips: lawn mowing plays first,
// then hands off to snow shoveling on end, looping back and forth.
const HERO_VIDEOS = [
  'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/hf_20260916_153138_b125f92c-1be7-4a81-8cb8-57ccf1c62495.mp4',
  'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/hf_20260916_154221_25a6b3a3-7c6d-45a7-bae6-c039f596092c.mp4',
];

const NAV_LINKS = [
  { label: 'For Neighbors', href: withBase('request/') },
  { label: 'For Butlers', href: withBase('auth/') },
  { label: 'Our Story', href: '#story' },
];

// Faceted bowtie mark — used only in the hero nav.
function BowtieMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 60" className={className} fill="none">
      <polygon points="4,6 4,54 44,30" fill="url(#bowtie-left)" />
      <polygon points="96,6 96,54 56,30" fill="url(#bowtie-right)" />
      <rect x="42" y="24" width="16" height="12" rx="3" fill="#0B0F0D" />
      <defs>
        <linearGradient id="bowtie-left" x1="4" y1="6" x2="44" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4EEE3" />
          <stop offset="1" stopColor="#8A9089" />
        </linearGradient>
        <linearGradient id="bowtie-right" x1="96" y1="6" x2="56" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4EEE3" />
          <stop offset="1" stopColor="#8A9089" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Hero() {
  const [videoIndex, setVideoIndex] = useState(0);

  return (
    <section className="relative w-full h-screen overflow-hidden bg-ink flex flex-col">
      <video
        key={videoIndex}
        className="absolute inset-0 w-full h-full object-cover"
        src={HERO_VIDEOS[videoIndex]}
        autoPlay
        muted
        playsInline
        onEnded={() => setVideoIndex((i) => (i + 1) % HERO_VIDEOS.length)}
      />

      <div className="relative z-10 flex flex-col h-full">
        <nav className="px-6 md:px-12 lg:px-16 pt-6 flex items-center justify-between">
          <a href={withBase('')} className="flex items-center gap-2.5 text-white">
            <BowtieMark className="w-[30px] h-[18px] sm:w-[34px] sm:h-[20px]" />
            <span className="text-[15px] sm:text-[20px] font-medium leading-none tracking-[-0.01em] uppercase whitespace-nowrap">
              Community Butler
            </span>
          </a>

          <div className="hidden md:flex liquid-glass rounded-full items-center gap-8 px-8 py-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-white text-[13px] font-medium uppercase tracking-[0.04em] hover:text-silver transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          <a
            href={withBase('request/')}
            className="rounded-full px-6 py-3 bg-sand text-ink text-[13px] font-medium uppercase tracking-[0.04em] whitespace-nowrap hover:bg-white transition-colors"
          >
            Post a Job
          </a>
        </nav>

        <div className="flex-1 flex flex-col justify-end pb-12 lg:pb-16 px-6 md:px-12 lg:px-16">
          <div className="lg:grid lg:grid-cols-2 lg:items-end lg:gap-8">
            <div>
              <AnimatedHeading
                text={'Real jobs, done\nby butlers next door.'}
                className="text-white text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-normal leading-[0.95] mb-4"
                style={{ letterSpacing: '-0.04em' }}
                initialDelay={200}
                charDelay={30}
                charDuration={500}
              />

              <FadeIn delay={800} duration={1000}>
                <p className="text-silver text-base md:text-lg max-w-md mb-8">
                  Community Butler connects busy neighbors with trained, motivated
                  high-school butlers for the everyday tasks that pile up.
                </p>
              </FadeIn>

              <FadeIn delay={1200} duration={1000}>
                <div className="flex flex-wrap gap-4">
                  <a
                    href={withBase('request/')}
                    className="bg-sand text-ink rounded-full px-8 py-4 text-sm font-medium uppercase tracking-[0.04em] hover:bg-white transition-colors"
                  >
                    Post a Job
                  </a>
                  <a
                    href={withBase('auth/?mode=signup')}
                    className="liquid-glass rounded-full px-8 py-4 text-white text-sm font-medium uppercase tracking-[0.04em] hover:text-silver transition-colors"
                  >
                    Become a Butler
                  </a>
                </div>
              </FadeIn>
            </div>

            <FadeIn delay={1400} duration={1000} className="hidden lg:flex justify-end">
              <div className="liquid-glass rounded-2xl px-6 py-4" style={{ background: 'rgba(31,51,39,0.45)' }}>
                <p className="text-silver text-[10px] font-semibold uppercase tracking-[0.12em] mb-1">
                  Services
                </p>
                <p className="text-white text-sm">Yard Work. Moving Help. Errands.</p>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>
    </section>
  );
}
