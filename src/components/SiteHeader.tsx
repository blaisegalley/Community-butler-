import { LogoMark, Wordmark } from '@/components/Logo';
import { withBase } from '@/lib/url';

export default function SiteHeader() {
  return (
    <header className="w-full max-w-[1800px] mx-auto px-5 sm:px-8 md:px-[82px] py-5 sm:py-6 flex flex-wrap items-center justify-between gap-4">
      <a href={withBase('')} className="flex items-center gap-2.5 text-ink">
        <LogoMark />
        <Wordmark />
      </a>
      <div className="flex items-center gap-3">
        <a
          href={withBase('auth/?mode=signin')}
          className="h-[42px] px-5 rounded-[11px] border border-ink/15 text-ink text-[13.5px] font-medium inline-flex items-center hover:bg-black/5 transition-colors"
        >
          Butler sign in
        </a>
        <a
          href={withBase('request/')}
          className="h-[42px] px-5 rounded-[11px] bg-ink text-white text-[13.5px] font-medium inline-flex items-center hover:opacity-90 transition-opacity"
        >
          Post a job
        </a>
      </div>
    </header>
  );
}
