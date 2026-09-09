import { LogoMark, Wordmark } from '@/components/Logo';
import AnimatedHeading from '@/components/AnimatedHeading';
import FadeIn from '@/components/FadeIn';

const NAV_LINKS = [
  { label: 'For Neighbors', href: '/request/' },
  { label: 'For Butlers', href: '/auth/' },
  { label: 'Our Story', href: '#story' },
];

export default function Hero() {
  return (
    <section className="relative w-full h-screen overflow-hidden bg-black flex flex-col">
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4"
        autoPlay
        loop
        muted
        playsInline
      />

      <div className="relative z-10 flex flex-col h-full">
        <nav className="px-6 md:px-12 lg:px-16 pt-6 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 text-white">
            <LogoMark />
            <Wordmark className="text-white" />
          </a>

          <div className="hidden md:flex liquid-glass rounded-full items-center gap-8 px-8 py-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-white text-sm font-medium hover:text-gray-300 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          <a
            href="/request/"
            className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:text-gray-300 transition-colors"
          >
            Post a Job
          </a>
        </nav>

        <div className="flex-1 flex flex-col justify-end pb-12 lg:pb-16 px-6 md:px-12 lg:px-16">
          <div className="lg:grid lg:grid-cols-2 lg:items-end lg:gap-8">
            <div>
              <AnimatedHeading
                text={'Real jobs, done\nby butlers next door.'}
                className="text-white text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-normal mb-4"
                style={{ letterSpacing: '-0.04em' }}
                initialDelay={200}
                charDelay={30}
                charDuration={500}
              />

              <FadeIn delay={800} duration={1000}>
                <p className="text-gray-300 text-base md:text-lg max-w-md mb-8">
                  Community Butler connects busy neighbors with trained, motivated
                  high-school butlers for the everyday tasks that pile up.
                </p>
              </FadeIn>

              <FadeIn delay={1200} duration={1000}>
                <div className="flex flex-wrap gap-4">
                  <a
                    href="/request/"
                    className="bg-white text-black rounded-full px-6 py-3 text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    Post a Job
                  </a>
                  <a
                    href="/auth/?mode=signup"
                    className="liquid-glass rounded-full px-6 py-3 text-white text-sm font-medium hover:text-gray-300 transition-colors"
                  >
                    Become a Butler
                  </a>
                </div>
              </FadeIn>
            </div>

            <FadeIn delay={1400} duration={1000} className="hidden lg:flex justify-end">
              <div className="liquid-glass rounded-2xl px-6 py-4 text-white text-sm">
                Yard Work. Moving Help. Errands.
              </div>
            </FadeIn>
          </div>
        </div>
      </div>
    </section>
  );
}
