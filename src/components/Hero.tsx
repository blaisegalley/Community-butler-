import { useEffect, useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import Animate from '@/components/Animate';
import { LogoMark, Wordmark } from '@/components/Logo';
import Scene3D from '@/components/Scene3D';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export default function Hero() {
  // Not just CSS-hidden below lg: the WebGL context and render loop are
  // genuinely never created on smaller/mobile viewports.
  const showScene = useMediaQuery('(min-width: 1024px)');

  return (
    <section className="relative w-full h-screen overflow-hidden bg-[#0B0B0C]">
      <img
        className="absolute inset-0 w-full h-full object-cover"
        src="https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/hf_20260908_153025_579aedf5-3521-45ec-8542-3f3e8ad91141.png"
        alt=""
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-[#0B0B0C]/60 to-[#0B0B0C]/20" />

      {/* Decorative Three.js accent — silver icosahedron, never mounted below lg */}
      {showScene && (
        <Animate
          delay={1100}
          direction="scale"
          className="absolute top-[76px] right-[64px] w-[240px] h-[240px] xl:w-[300px] xl:h-[300px] z-[5] pointer-events-none"
        >
          <Scene3D className="w-full h-full" />
        </Animate>
      )}

      <div className="relative z-10 h-full flex flex-col">
        <Nav />

        <div className="flex-1 flex items-center py-8">
          <div className="w-full max-w-[1800px] mx-auto px-5 sm:px-8 md:px-[82px] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-10 lg:gap-12">
            <div className="max-w-[593px]">
              <Animate delay={300} direction="up">
                <h1 className="text-white text-[36px] sm:text-[52px] md:text-[64px] lg:text-[72px] font-normal leading-[0.95] mb-5 sm:mb-8">
                  Real jobs, done by butlers who live right down the street
                </h1>
              </Animate>

              <Animate delay={500} direction="up">
                <p className="text-white/80 text-[16px] sm:text-[18px] md:text-[20px] font-normal leading-[1.3] max-w-[420px] mb-7 sm:mb-10">
                  Community Butler connects busy neighbors with trained, motivated high-school butlers for the everyday tasks that pile up.
                </p>
              </Animate>

              <Animate delay={700} direction="up">
                <div className="flex flex-wrap gap-3 sm:gap-4">
                  <a
                    href="/request/"
                    className="h-[46px] sm:h-[51px] px-5 sm:px-[27px] bg-[#E9E9E9] rounded-[12px] text-[#0A0707] text-[14px] sm:text-[15.5px] font-medium leading-[15.5px] transition-opacity hover:opacity-90 inline-flex items-center justify-center"
                  >
                    Post a job
                  </a>
                  <a
                    href="/auth/?mode=signup"
                    className="h-[46px] sm:h-[51px] px-5 sm:px-[27px] rounded-[12px] border border-white text-white text-[14px] sm:text-[15.5px] font-medium leading-[15.5px] transition-opacity hover:opacity-80 inline-flex items-center justify-center"
                  >
                    Become a butler
                  </a>
                </div>
              </Animate>
            </div>

            <TrustCard />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustCard() {
  return (
    <Animate delay={900} direction="scale" className="w-full max-w-[405px] mx-auto lg:mx-0">
      <div className="w-full rounded-[24px] sm:rounded-[33px] bg-[rgba(30,30,32,0.35)] backdrop-blur-[20px] p-5 sm:p-8 pb-5 sm:pb-6 border border-white/10">
        <p className="text-white text-[16px] sm:text-[20px] font-medium leading-[20px] mb-3 sm:mb-4">
          Jobs completed this month
        </p>
        <p className="mb-2 sm:mb-3 text-white text-[36px] sm:text-[52px] font-semibold leading-[1]">
          [STAT]
        </p>
        <div className="flex items-center gap-[10px] mb-6 sm:mb-8">
          <span className="px-[8px] py-[7px] bg-white/20 rounded-[6px] text-white text-[12px] sm:text-[14px] font-medium leading-[14px]">
            4.9 ★
          </span>
          <span className="text-white/80 text-[12px] sm:text-[14px] font-medium leading-[14px]">
            average butler rating
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-white/90 text-[13px] sm:text-[14px]">Arlington Heights</span>
            <span className="text-white/50 text-[13px] sm:text-[14px]">Live now</span>
          </div>
          <div className="h-px bg-white/10" />
          <div className="flex items-center justify-between">
            <span className="text-white/90 text-[13px] sm:text-[14px]">Palatine</span>
            <span className="text-white/50 text-[13px] sm:text-[14px]">Launching soon</span>
          </div>
        </div>
      </div>
    </Animate>
  );
}

function Nav() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const mobileLinks = ['How it works', 'Areas we serve', 'Our story'];

  return (
    <>
      <nav className="w-full max-w-[1800px] mx-auto px-5 sm:px-8 md:px-[82px] pt-[20px] sm:pt-[30px] flex items-center justify-between relative z-50">
        <Animate delay={0} direction="down">
          <a href="/" className="flex items-center gap-2.5 text-white">
            <LogoMark />
            <Wordmark className="text-white" />
          </a>
        </Animate>

        <Animate delay={100} direction="down" className="hidden lg:block">
          <div className="h-[52px] px-6 flex items-center gap-[30px] bg-[rgba(20,20,22,0.45)] rounded-[11px] backdrop-blur-[17px] border border-white/10">
            <button className="flex items-center gap-[5px] text-white/80 text-[14px] font-medium leading-[14px] hover:text-white transition-colors">
              How it works
              <ChevronDown className="w-[10px] h-[10px] opacity-80" />
            </button>
            <span className="cursor-pointer text-white/80 text-[14px] font-medium leading-[14px] hover:text-white transition-colors">
              Areas we serve
            </span>
            <span className="cursor-pointer text-white/80 text-[14px] font-medium leading-[14px] hover:text-white transition-colors">
              Our story
            </span>
          </div>
        </Animate>

        <Animate delay={200} direction="down" className="hidden lg:block">
          <div className="h-[52px] p-[3px] bg-[rgba(0,0,0,0.35)] rounded-[13px] backdrop-blur-[17px] flex items-center gap-[5px]">
            <a
              href="/auth/?mode=signup"
              className="h-[46px] px-6 rounded-[11px] text-white text-[14px] font-medium leading-[14px] hover:bg-white/5 transition-colors inline-flex items-center"
            >
              Become a butler
            </a>
            <a
              href="/request/"
              className="h-[46px] px-6 bg-[#E9E9E9] rounded-[11px] text-[#0A0707] text-[14px] font-medium leading-[14px] hover:bg-white transition-colors inline-flex items-center"
            >
              Post a job
            </a>
          </div>
        </Animate>

        <Animate delay={100} direction="down" className="lg:hidden">
          <button
            className="w-[44px] h-[44px] flex items-center justify-center rounded-[11px] bg-[rgba(20,20,22,0.45)] backdrop-blur-[17px] transition-colors hover:bg-white/10"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            <div className="relative w-5 h-5">
              <Menu
                className={`w-5 h-5 text-white absolute inset-0 transition-all duration-300 ease-out ${isOpen ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100'}`}
              />
              <X
                className={`w-5 h-5 text-white absolute inset-0 transition-all duration-300 ease-out ${isOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75'}`}
              />
            </div>
          </button>
        </Animate>
      </nav>

      <div
        className={`lg:hidden fixed inset-0 z-40 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? 'visible' : 'invisible'}`}
      >
        <div
          className={`absolute inset-0 bg-[#0B0B0C]/90 backdrop-blur-[24px] transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setIsOpen(false)}
        />

        <div
          className={`absolute top-[76px] sm:top-[86px] left-4 right-4 sm:left-6 sm:right-6 bg-[rgba(20,20,22,0.7)] backdrop-blur-[30px] rounded-[20px] border border-white/[0.08] p-6 sm:p-8 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] origin-top ${isOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-4 scale-[0.97]'}`}
        >
          <div className="flex flex-col gap-1">
            {mobileLinks.map((label, i) => (
              <a
                key={label}
                href="#"
                className={`flex items-center justify-between px-4 py-4 rounded-[12px] text-white/90 text-[18px] font-medium hover:bg-white/[0.06] transition-all duration-300 ${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-3'}`}
                style={{ transitionDelay: isOpen ? `${100 + i * 50}ms` : '0ms' }}
              >
                {label}
                {label === 'How it works' && <ChevronDown className="w-4 h-4 opacity-50" />}
              </a>
            ))}
          </div>

          <div className="h-px bg-white/10 my-5" />

          <div
            className={`flex flex-col gap-3 transition-all duration-300 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
            style={{ transitionDelay: isOpen ? '350ms' : '0ms' }}
          >
            <a
              href="/request/"
              className="w-full h-[50px] bg-[#E9E9E9] rounded-[12px] text-[#0A0707] text-[15px] font-medium transition-colors hover:bg-white flex items-center justify-center"
            >
              Post a job
            </a>
            <a
              href="/auth/?mode=signup"
              className="w-full h-[50px] rounded-[12px] border border-white/30 text-white text-[15px] font-medium transition-colors hover:bg-white/5 flex items-center justify-center"
            >
              Become a butler
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
