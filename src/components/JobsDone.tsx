import { ReactNode, useEffect, useRef, useState } from 'react';
import Animate from '@/components/Animate';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { addJob } from '@/lib/store';

interface ServiceCard {
  id: string;
  title: string;
  accent: string;
  video: string;
  /** Still frame shown before the clip loads, and instead of it under reduced motion. */
  poster: string;
  icon: ReactNode;
  /** Value stored on the job record, matching the request form's service names. */
  service: string;
  jobTitle: string;
  tag: string;
  photo: string;
  included: string[];
}

function iconProps() {
  return { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
}

function MowerIcon() {
  return (
    <svg {...iconProps()} className="w-4 h-4">
      <circle cx="7" cy="17" r="2.4" />
      <circle cx="17" cy="17" r="2.4" />
      <path d="M9.2 17h5.6" />
      <path d="M7 14.6V10a4 4 0 0 1 4-4h1.5L17 10.5V14.6" />
      <path d="M12.5 6 15 3.5" />
    </svg>
  );
}

function SnowflakeIcon() {
  return (
    <svg {...iconProps()} className="w-4 h-4">
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
      <path d="M9 4.5 12 6l3-1.5M9 19.5 12 18l3 1.5M4.5 9.8 6 12l-1.5 2.2M19.5 9.8 18 12l1.5 2.2" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg {...iconProps()} className="w-4 h-4">
      <path d="M3.5 8.5 12 4l8.5 4.5L12 13z" />
      <path d="M3.5 8.5V16l8.5 4.5L20.5 16V8.5" />
      <path d="M12 13v7.5" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg {...iconProps()} className="w-4 h-4">
      <path d="M20 4C10 4 4 10 4 18c0 .6.06 1.2.16 1.8C13 19 20 12.5 20 4z" />
      <path d="M6 18 20 4" />
    </svg>
  );
}

function PawIcon() {
  return (
    <svg {...iconProps()} className="w-4 h-4" fill="currentColor" stroke="none">
      <ellipse cx="12" cy="16.2" rx="4.6" ry="4" />
      <ellipse cx="5.5" cy="9.5" rx="2.1" ry="2.6" />
      <ellipse cx="18.5" cy="9.5" rx="2.1" ry="2.6" />
      <ellipse cx="9.3" cy="6" rx="1.8" ry="2.3" />
      <ellipse cx="14.7" cy="6" rx="1.8" ry="2.3" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

const CDN_VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/';
const CDN_PHOTO = 'https://d2ol7oe51mr4n9.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/';

const SERVICES: ServiceCard[] = [
  {
    id: 'yard',
    title: 'Yard work,',
    accent: 'done right.',
    video: `${CDN_VIDEO}hf_20260916_153138_b125f92c-1be7-4a81-8cb8-57ccf1c62495.mp4`,
    poster: `${CDN_PHOTO}8bfc9651-4902-49e6-9614-7c62a7a68a6c.jpg`,
    icon: <MowerIcon />,
    service: 'Yard work',
    jobTitle: 'Yard Work',
    tag: 'Mowing, trimming, and cleanup — done right, by a butler two streets over.',
    photo: `${CDN_PHOTO}799ab5f9-49b1-473b-a6c6-a863466ad769.jpg`,
    included: ['Mowing, edging & trimming', 'Grass clippings cleared', 'Weekly or one-time'],
  },
  {
    id: 'snow',
    title: 'Snow removal,',
    accent: 'handled fast.',
    video: `${CDN_VIDEO}hf_20260916_154221_25a6b3a3-7c6d-45a7-bae6-c039f596092c.mp4`,
    poster: `${CDN_PHOTO}2928118b-22a7-4cfa-930c-1203538e04c4.jpg`,
    icon: <SnowflakeIcon />,
    service: 'Snow shoveling',
    jobTitle: 'Snow Removal',
    tag: 'Driveways and walkways cleared before you need to leave.',
    photo: `${CDN_PHOTO}241eb5fd-50a7-449b-bd8c-efb102ebaa9a.jpg`,
    included: ['Driveway & walkway shoveling', 'Salt on request', 'Same-day when possible'],
  },
  {
    id: 'moving',
    title: 'Moving day,',
    accent: 'made easy.',
    video: `${CDN_VIDEO}hf_20260916_181144_57446324-9c94-419a-8d11-125309bf9312.mp4`,
    poster: `${CDN_PHOTO}0d9495f0-0cbd-4982-bf78-2193e396edf9.jpg`,
    icon: <BoxIcon />,
    service: 'Moving help',
    jobTitle: 'Moving Help',
    tag: 'An extra pair of hands for boxes, furniture, and everything in between.',
    photo: `${CDN_PHOTO}5de11fda-5b32-4707-a1f8-9a98f4fac2e4.jpg`,
    included: ['Loading & unloading', 'Furniture handled with care', 'Local moves'],
  },
  {
    id: 'raking',
    title: 'Raking leaves,',
    accent: 'taken care of.',
    video: `${CDN_VIDEO}hf_20260917_022420_7f2e762b-58eb-483c-aad8-7a41c3863375.mp4`,
    poster: `${CDN_PHOTO}cb7882a8-56d2-4689-8857-648f601a9b31.jpg`,
    icon: <LeafIcon />,
    service: 'Raking leaves',
    jobTitle: 'Raking Leaves',
    tag: 'A tidy yard, without the weekend spent doing it yourself.',
    photo: `${CDN_PHOTO}5d4a8c43-976a-465b-abde-5104d7aaf689.jpg`,
    included: ['Leaves raked & bagged', 'Curbside pickup ready', 'Seasonal or one-time'],
  },
  {
    id: 'dog',
    title: 'Dog walks,',
    accent: 'covered daily.',
    video: `${CDN_VIDEO}hf_20260916_182639_e2b0cbfd-00f7-4784-adb3-14c8af8b0a12.mp4`,
    poster: `${CDN_PHOTO}019054c5-e6dc-4c16-89ea-07fabe200b01.jpg`,
    icon: <PawIcon />,
    service: 'Dog walking',
    jobTitle: 'Dog Walking',
    tag: "A friendly, reliable walk while you're busy or away.",
    photo: `${CDN_PHOTO}3b86f63d-f608-48f5-8e69-7ef27c7fbbb5.jpg`,
    included: ['Daily or one-time walks', 'Same butler each visit', 'Fresh water & a quick check-in'],
  },
];

const EMPTY_FORM = { name: '', phone: '', email: '', address: '', date: '', details: '' };

const inputClass =
  'w-full border border-black/15 rounded-[10px] px-[14px] py-3 text-[14.5px] text-[#0B0B0C] bg-white outline-none focus:border-black/40 transition-colors';
const labelClass = 'block text-[#0B0B0C] text-[13px] font-medium mb-[6px]';

/**
 * Shows the poster frame until the card is near the viewport, then loads and
 * plays the clip; pauses again once it scrolls away. Under reduced motion the
 * clip is never fetched and the poster stands in for it.
 */
function CardVideo({ src, poster, alt }: { src: string; poster: string; alt: string }) {
  const reduceMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (reduceMotion) return;
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { rootMargin: '250px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduceMotion]);

  const className = 'absolute inset-0 w-full h-full object-cover opacity-75 transition-opacity duration-300 group-hover:opacity-95';

  if (reduceMotion) {
    return <img className={className} src={poster} alt={alt} loading="lazy" />;
  }

  return <video ref={videoRef} className={className} src={src} poster={poster} muted loop playsInline preload="none" />;
}

export default function JobsDone() {
  const reduceMotion = usePrefersReducedMotion();
  const [active, setActive] = useState<ServiceCard | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  function openJob(service: ServiceCard) {
    setForm(EMPTY_FORM);
    setSent(false);
    setActive(service);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    addJob({ ...form, service: active.service, budget: '' });
    setSent(true);
  }

  function update(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <>
      <section className="w-full bg-[#0A0A0B] py-20 sm:py-28 overflow-hidden">
        <div
          className={`w-full max-w-[1800px] mx-auto px-5 sm:px-8 md:px-[82px] ${
            reduceMotion
              ? ''
              : `transition-[transform,opacity] ease-[cubic-bezier(0.16,1,0.3,1)] ${active ? 'duration-[400ms]' : 'duration-200'}`
          }`}
          style={
            active
              ? reduceMotion
                ? { opacity: 0.35, pointerEvents: 'none' }
                : { transform: 'scale(0.94)', opacity: 0.35, pointerEvents: 'none' }
              : undefined
          }
        >
          <Animate delay={0} direction="up" className="max-w-[640px] mb-14 sm:mb-16">
            <p className="text-chrome/70 text-[13px] font-semibold tracking-[0.08em] uppercase mb-3">
              What we handle
            </p>
            <h2 className="bg-gradient-to-r from-white via-chrome to-white bg-clip-text text-transparent text-[32px] sm:text-[44px] font-normal leading-[1.05] tracking-[-0.01em] mb-4">
              The Rounds
            </h2>
            <p className="text-white/50 text-[16px] sm:text-[18px] leading-[1.4]">
              The everyday work that piles up, picked up by a butler two streets over.
            </p>
          </Animate>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7">
            {SERVICES.map((service, i) => (
              <Animate key={service.id} delay={150 + i * 100} direction="up">
                <button
                  type="button"
                  onClick={() => openJob(service)}
                  aria-label={`Book ${service.jobTitle}`}
                  className="group relative block w-full text-left aspect-[3/4] rounded-[28px] overflow-hidden bg-[#131315] border border-white/[0.06] transition-[transform,border-color] duration-200 hover:-translate-y-1 hover:border-white/20"
                >
                  <CardVideo src={service.video} poster={service.poster} alt={service.jobTitle} />
                  <div
                    className="absolute inset-0"
                    style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.92) 100%)' }}
                  />

                  <div className="relative z-10 h-full flex flex-col justify-between p-6 sm:p-7">
                    <div className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-chrome">
                      {service.icon}
                    </div>

                    <div className="flex flex-col gap-3">
                      <p className="text-white text-[26px] sm:text-[30px] font-semibold leading-[1.08] tracking-[-0.01em]">
                        {service.title}
                        <br />
                        <span className="bg-gradient-to-r from-white via-chrome to-white bg-clip-text text-transparent">{service.accent}</span>
                      </p>
                      <span className="text-white/55 text-[12px]">Tap to book →</span>
                    </div>
                  </div>
                </button>
              </Animate>
            ))}
          </div>
        </div>
      </section>

      <div
        className={`fixed inset-0 z-[100] bg-white overflow-y-auto ${
          reduceMotion
            ? 'transition-opacity duration-200'
            : `transition-[transform,opacity] ease-[cubic-bezier(0.16,1,0.3,1)] ${active ? 'duration-[400ms]' : 'duration-200'}`
        }`}
        style={{
          transformOrigin: 'left center',
          transform: reduceMotion
            ? undefined
            : active
              ? 'perspective(1800px) rotateY(0deg) scale(1)'
              : 'perspective(1800px) rotateY(-35deg) scale(0.85)',
          opacity: active ? 1 : 0,
          pointerEvents: active ? 'auto' : 'none',
        }}
        aria-hidden={!active}
      >
        {active && (
          <>
            <nav className="flex items-center justify-between gap-4 px-5 sm:px-7 py-[22px] max-w-[1100px] mx-auto">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="flex items-center gap-2 text-[#0B0B0C] text-[14px] font-medium"
              >
                <ArrowLeftIcon />
                Back
              </button>
              <span className="text-[#0B0B0C] text-[14px] font-semibold tracking-[0.02em]">COMMUNITY BUTLER</span>
              <span className="w-[50px]" />
            </nav>

            <div className="relative w-full h-[60vh] min-h-[420px] overflow-hidden">
              <img src={active.photo} alt={active.jobTitle} className="absolute inset-0 w-full h-full object-cover" />
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.75) 100%)' }}
              />
              <div className="absolute left-0 right-0 bottom-0 px-5 sm:px-7 py-12 sm:py-14 max-w-[1100px] mx-auto">
                <h2 className="font-serif text-white m-0 leading-[0.95] tracking-[-0.01em] text-[clamp(48px,8vw,96px)]">
                  {active.jobTitle}
                </h2>
                <p className="text-white/80 text-[16px] mt-[14px] max-w-[480px]">{active.tag}</p>
              </div>
            </div>

            <div className="max-w-[1100px] mx-auto px-5 sm:px-7 pt-14 pb-24 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14">
              <div>
                <h3 className="text-[#0B0B0C] text-[22px] font-semibold mb-[14px]">What&apos;s included</h3>
                <ul className="text-[#4A4A4E] text-[15px] leading-[1.8] list-disc pl-5">
                  {active.included.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <h3 className="text-[#0B0B0C] text-[22px] font-semibold mt-7 mb-[14px]">How it works</h3>
                <p className="text-[#4A4A4E] text-[15px] leading-[1.6]">
                  Tell us what you need below. A manager confirms the details and matches you with a nearby butler — nothing is
                  charged until the job is booked.
                </p>
              </div>

              <div>
                {sent ? (
                  <div className="text-center py-10 px-5">
                    <h3 className="text-[#0B0B0C] text-[22px] font-semibold mb-3">Request sent</h3>
                    <p className="text-[#4A4A4E] text-[15px] leading-[1.6]">
                      Thanks — a manager will follow up shortly. Nothing has been charged.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActive(null)}
                      className="mt-6 bg-[#0B0B0C] text-white rounded-[12px] px-6 py-3 text-[15px] font-medium"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-[14px]">
                    <div>
                      <label className={labelClass} htmlFor="book-name">Your name</label>
                      <input id="book-name" className={inputClass} required value={form.name} onChange={(e) => update('name', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="book-phone">Phone number</label>
                      <input id="book-phone" type="tel" className={inputClass} required value={form.phone} onChange={(e) => update('phone', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="book-email">Email</label>
                      <input id="book-email" type="email" className={inputClass} value={form.email} onChange={(e) => update('email', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="book-address">Address or area</label>
                      <input id="book-address" className={inputClass} required value={form.address} onChange={(e) => update('address', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="book-date">Preferred date</label>
                      <input id="book-date" type="date" className={inputClass} value={form.date} onChange={(e) => update('date', e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="book-details">Details</label>
                      <textarea id="book-details" rows={3} className={inputClass} value={form.details} onChange={(e) => update('details', e.target.value)} />
                    </div>
                    <button
                      type="submit"
                      className="mt-[6px] bg-[#0B0B0C] text-white rounded-[12px] py-[15px] text-[15px] font-medium"
                    >
                      Book This Job
                    </button>
                  </form>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
