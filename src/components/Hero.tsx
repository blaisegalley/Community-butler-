import { useEffect, useRef, useState } from 'react';
import AnimatedHeading from '@/components/AnimatedHeading';
import FadeIn from '@/components/FadeIn';
import { withBase } from '@/lib/url';

// Hero background loops through these clips in order, crossfading between
// each: snow shoveling, moving a couch, walking a dog, mowing the lawn,
// then weeding — back to the start.
const HERO_VIDEOS = [
  'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/hf_20260916_154221_25a6b3a3-7c6d-45a7-bae6-c039f596092c.mp4', // snow shoveling
  'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/hf_20260916_181144_57446324-9c94-419a-8d11-125309bf9312.mp4', // moving a couch
  'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/hf_20260916_182639_e2b0cbfd-00f7-4784-adb3-14c8af8b0a12.mp4', // walking a dog
  'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/hf_20260916_153138_b125f92c-1be7-4a81-8cb8-57ccf1c62495.mp4', // mowing the lawn
  'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/hf_20260916_181548_5fa38635-59ee-467a-a3c4-2d44a97a88ae.mp4', // weeding
];
const FADE_MS = 800;
const LEAD_S = 0.35; // start the crossfade this many seconds before a clip's natural end

// Two persistent <video> elements crossfade into each other instead of being
// remounted, so the next clip is already preloaded and playing by the time
// its fade-in starts — no black flash, no re-fetch stutter. z-index/opacity
// are set via inline style rather than Tailwind arbitrary-value classes,
// since those can get dropped by the production CSS build.
function HeroVideoBackground() {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const [aIsFront, setAIsFront] = useState(true);

  useEffect(() => {
    const a = videoARef.current;
    const b = videoBRef.current;
    if (!a || !b) return;

    let front = a;
    let back = b;
    let frontIndex = 0;
    let transitioning = false;

    function crossfade() {
      if (transitioning) return;
      transitioning = true;
      back.currentTime = 0;
      back.play().catch(() => {});
      setAIsFront(back === a);
      frontIndex = (frontIndex + 1) % HERO_VIDEOS.length;
      window.setTimeout(() => {
        front.pause();
        const tmp = front;
        front = back;
        back = tmp;
        const nextIndex = (frontIndex + 1) % HERO_VIDEOS.length;
        back.src = HERO_VIDEOS[nextIndex];
        back.load();
        transitioning = false;
      }, FADE_MS);
    }

    function onTimeUpdate(video: HTMLVideoElement) {
      if (transitioning || video !== front || !video.duration) return;
      if (video.currentTime >= video.duration - LEAD_S) crossfade();
    }

    const onATime = () => onTimeUpdate(a);
    const onBTime = () => onTimeUpdate(b);
    a.addEventListener('timeupdate', onATime);
    b.addEventListener('timeupdate', onBTime);

    front.src = HERO_VIDEOS[0];
    front.currentTime = 0;
    front.play().catch(() => {});
    back.src = HERO_VIDEOS[1];
    back.load();

    return () => {
      a.removeEventListener('timeupdate', onATime);
      b.removeEventListener('timeupdate', onBTime);
    };
  }, []);

  return (
    <>
      <video
        ref={videoARef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: aIsFront ? 1 : 0, zIndex: aIsFront ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
        muted
        playsInline
      />
      <video
        ref={videoBRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: aIsFront ? 0 : 1, zIndex: aIsFront ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }}
        muted
        playsInline
      />
    </>
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

export default function Hero() {
  return (
    <section className="relative w-full h-screen overflow-hidden bg-ink flex flex-col">
      <HeroVideoBackground />

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
