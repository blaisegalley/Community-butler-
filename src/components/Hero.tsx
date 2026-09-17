import { useEffect, useRef, useState } from 'react';
import AnimatedHeading from '@/components/AnimatedHeading';
import FadeIn from '@/components/FadeIn';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { withBase } from '@/lib/url';

/** How long to let the browser's own autoplay settle before offering a tap target. */
const AUTOPLAY_GRACE_MS = 2000;

const VIDEO_CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/';
const PHOTO_CDN = 'https://d2ol7oe51mr4n9.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/';

// Hero background loops through these clips in order, crossfading between
// each: snow shoveling, moving a couch, walking a dog, mowing the lawn,
// then weeding — back to the start. Each carries a poster frame so the
// first paint shows the scene instead of a black rectangle.
const HERO_VIDEOS = [
  { src: `${VIDEO_CDN}hf_20260916_154221_25a6b3a3-7c6d-45a7-bae6-c039f596092c.mp4`, poster: `${PHOTO_CDN}241eb5fd-50a7-449b-bd8c-efb102ebaa9a.jpg` }, // snow shoveling
  { src: `${VIDEO_CDN}hf_20260916_181144_57446324-9c94-419a-8d11-125309bf9312.mp4`, poster: `${PHOTO_CDN}5de11fda-5b32-4707-a1f8-9a98f4fac2e4.jpg` }, // moving a couch
  { src: `${VIDEO_CDN}hf_20260916_182639_e2b0cbfd-00f7-4784-adb3-14c8af8b0a12.mp4`, poster: `${PHOTO_CDN}3b86f63d-f608-48f5-8e69-7ef27c7fbbb5.jpg` }, // walking a dog
  { src: `${VIDEO_CDN}hf_20260916_153138_b125f92c-1be7-4a81-8cb8-57ccf1c62495.mp4`, poster: `${PHOTO_CDN}799ab5f9-49b1-473b-a6c6-a863466ad769.jpg` }, // mowing the lawn
  { src: `${VIDEO_CDN}hf_20260916_181548_5fa38635-59ee-467a-a3c4-2d44a97a88ae.mp4`, poster: `${PHOTO_CDN}3b351f2a-8693-450b-8791-f81451de9031.jpg` }, // weeding
];
// A single <video> per clip, remounted via `key` on each switch, with
// autoPlay/src/muted/playsInline set declaratively — the plain, reliable
// React video-autoplay pattern. A short opacity fade-in on mount (inline
// style, not a Tailwind arbitrary class) softens the cut between clips
// without needing two video elements playing at once.
//
// Playback is left entirely to the autoPlay attribute. Calling play()
// alongside it races the browser's own autoplay and rejects with an
// AbortError even when the clip is playing perfectly well, which used to
// surface a tap-to-play button over a working video. Instead, wait out a
// grace period and only offer the button if the element is genuinely still
// paused — the case where a browser really did block muted autoplay.
function HeroVideo({ src, poster, onEnded }: { src: string; poster: string; onEnded: () => void }) {
  const reduceMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    const stillStuck = setTimeout(() => {
      const video = videoRef.current;
      if (video && video.paused) setNeedsTap(true);
    }, AUTOPLAY_GRACE_MS);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(stillStuck);
    };
  }, []);

  function handleTap() {
    videoRef.current
      ?.play()
      .then(() => setNeedsTap(false))
      .catch(() => {});
  }

  return (
    <>
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={
          reduceMotion
            ? undefined
            : { opacity: visible ? 1 : 0, transition: 'opacity 700ms ease' }
        }
        src={src}
        poster={poster}
        autoPlay
        muted
        playsInline
        onEnded={onEnded}
        onPlaying={() => setNeedsTap(false)}
      />
      {needsTap && (
        <button
          type="button"
          onClick={handleTap}
          aria-label="Play background video"
          // Sits above the video/scrim but below the nav and CTAs (z-10), so a
          // blocked autoplay never makes the header unclickable.
          className="absolute inset-0 z-[6] flex items-center justify-center bg-black/25"
        >
          <span className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
            <svg viewBox="0 0 24 24" className="w-6 h-6 ml-1" fill="#0B0F0D">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </>
  );
}

function HeroVideoBackground() {
  const [videoIndex, setVideoIndex] = useState(0);
  const clip = HERO_VIDEOS[videoIndex];
  return (
    <HeroVideo
      key={videoIndex}
      src={clip.src}
      poster={clip.poster}
      onEnded={() => setVideoIndex((i) => (i + 1) % HERO_VIDEOS.length)}
    />
  );
}

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

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

export default function Hero() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <section className="relative w-full h-screen overflow-hidden bg-ink flex flex-col">
      <HeroVideoBackground />

      <div
        className="absolute inset-0 z-[5] pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.12) 32%, rgba(0,0,0,0.32) 62%, rgba(0,0,0,0.80) 100%)',
        }}
      />

      <div className="relative z-10 flex flex-col h-full">
        <nav className="px-6 md:px-12 lg:px-16 pt-6 flex items-center justify-between gap-3">
          <a href={withBase('')} className={`flex items-center gap-2.5 text-white rounded-md ${focusRing}`}>
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
                className={`text-white text-[13px] font-medium uppercase tracking-[0.04em] hover:text-silver transition-colors rounded-sm ${focusRing}`}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <a
              href={withBase('request/')}
              className={`hidden sm:inline-block rounded-full px-6 py-3 bg-sand text-ink text-[13px] font-medium uppercase tracking-[0.04em] whitespace-nowrap hover:bg-white transition-colors ${focusRing}`}
            >
              Post a Job
            </a>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="hero-mobile-menu"
              className={`md:hidden w-11 h-11 rounded-full liquid-glass flex items-center justify-center text-white ${focusRing}`}
            >
              <MenuIcon />
            </button>
          </div>
        </nav>

        {menuOpen && (
          <div id="hero-mobile-menu" className="md:hidden fixed inset-0 z-50 bg-ink flex flex-col">
            <div className="px-6 pt-6 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className={`w-11 h-11 rounded-full border border-white/20 flex items-center justify-center text-white ${focusRing}`}
              >
                <CloseIcon />
              </button>
            </div>

            <nav className="flex-1 flex flex-col justify-center gap-2 px-8">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`text-white text-2xl font-medium py-3 rounded-md ${focusRing}`}
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="px-8 pb-12 flex flex-col gap-3">
              <a
                href={withBase('request/')}
                className={`text-center bg-sand text-ink rounded-full px-8 py-4 text-sm font-medium uppercase tracking-[0.04em] ${focusRing}`}
              >
                Post a Job
              </a>
              <a
                href={withBase('auth/?mode=signup')}
                className={`text-center border border-white/25 text-white rounded-full px-8 py-4 text-sm font-medium uppercase tracking-[0.04em] ${focusRing}`}
              >
                Become a Butler
              </a>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col justify-end pb-12 lg:pb-16 px-6 md:px-12 lg:px-16">
          <div className="lg:grid lg:grid-cols-2 lg:items-end lg:gap-8">
            <div>
              <AnimatedHeading
                text={'Real jobs, done\nby butlers next door.'}
                className="text-white text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-normal leading-[0.95] mb-4"
                style={{ letterSpacing: '-0.04em' }}
                delay={100}
                duration={400}
              />

              <FadeIn delay={250}>
                <p className="text-silver text-base md:text-lg max-w-md mb-8">
                  Community Butler connects busy neighbors with trained, motivated
                  high-school butlers for the everyday tasks that pile up.
                </p>
              </FadeIn>

              <FadeIn delay={350}>
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

            <FadeIn delay={450} className="hidden lg:flex justify-end">
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
