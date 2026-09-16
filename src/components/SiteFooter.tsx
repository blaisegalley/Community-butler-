import { LogoMark, Wordmark } from '@/components/Logo';
import { withBase } from '@/lib/url';

export default function SiteFooter() {
  return (
    <footer className="w-full bg-ink text-white/70 py-10 sm:py-12">
      <div className="w-full max-w-[1800px] mx-auto px-5 sm:px-8 md:px-[82px] flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
        <a href={withBase('')} className="flex items-center gap-2.5 text-[#C7C9CC]">
          <LogoMark className="text-[#C7C9CC]" />
          <Wordmark className="text-white" />
        </a>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13.5px]">
          <a href="mailto:thecommunitybutler@gmail.com" className="hover:text-white transition-colors">
            thecommunitybutler@gmail.com
          </a>
          <a href="tel:+12246339328" className="hover:text-white transition-colors">
            (224) 633-9328
          </a>
          <a
            href="https://groupme.com/join_group/116716938/yCXfMLwo"
            target="_blank"
            rel="noopener"
            className="hover:text-white transition-colors"
          >
            Join the Butler GroupMe
          </a>
        </div>
      </div>
      <p className="text-white/35 text-[12px] text-center mt-8">
        © {new Date().getFullYear()} Community Butler. All rights reserved.
      </p>
    </footer>
  );
}
