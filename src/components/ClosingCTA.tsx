import Animate from '@/components/Animate';
import { withBase } from '@/lib/url';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink';

export default function ClosingCTA() {
  return (
    <section className="w-full bg-ink py-20 sm:py-28">
      <div className="w-full max-w-[1800px] mx-auto px-5 sm:px-8 md:px-[82px]">
        <Animate delay={0} direction="up" className="max-w-[720px]">
          <h2 className="text-white text-[32px] sm:text-[48px] font-normal leading-[1.05] tracking-[-0.02em] mb-5">
            Something on your list that never gets done?
          </h2>
          <p className="text-silver text-[16px] sm:text-[18px] leading-[1.5] mb-9">
            Post it in two minutes. A manager reads it, a butler two streets over picks it up, and it stops being your
            problem.
          </p>
          <div className="flex flex-wrap gap-4">
            <a
              href={withBase('request/')}
              className={`bg-sand text-ink rounded-full px-8 py-4 text-sm font-medium uppercase tracking-[0.04em] hover:bg-white transition-colors ${focusRing}`}
            >
              Post a Job
            </a>
            <a
              href={withBase('auth/?mode=signup')}
              className={`border border-white/25 text-white rounded-full px-8 py-4 text-sm font-medium uppercase tracking-[0.04em] hover:border-white/60 transition-colors ${focusRing}`}
            >
              Become a Butler
            </a>
          </div>
        </Animate>
      </div>
    </section>
  );
}
