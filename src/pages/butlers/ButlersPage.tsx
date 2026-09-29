import Animate from '@/components/Animate';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { getPublicButlers } from '@/lib/profiles';
import { isShared } from '@/lib/store';
import { useQuery } from '@/lib/useQuery';
import { withBase } from '@/lib/url';

/** Initials, for a profile whose photo fails to load. */
function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

export default function ButlersPage() {
  // Without a database there is nothing to fetch, and a red error banner
  // is the wrong thing to show a neighbour on a public page. Skip the
  // query and fall through to the empty state, which explains itself.
  const { data, loading, error } = useQuery(async () => (isShared ? getPublicButlers() : []));
  const butlers = data ?? [];

  return (
    <div className="min-h-screen bg-sand flex flex-col">
      <SiteHeader />

      <main className="flex-1 w-full max-w-[1100px] mx-auto px-5 sm:px-8 py-12 sm:py-16">
        <Animate delay={0} direction="up" className="max-w-[640px] mb-10 sm:mb-12">
          <p className="text-forest text-[13px] font-semibold tracking-[0.08em] uppercase mb-3">Our team</p>
          <h1 className="text-charcoal text-[32px] sm:text-[44px] font-normal leading-[1.05] tracking-[-0.01em] mb-4">
            Meet our butlers
          </h1>
          <p className="text-graphite text-[16px] sm:text-[17px] leading-[1.6]">
            These are the students who actually show up. Every profile here has been read and approved by a manager
            before it went up, and every butler has a parent&rsquo;s consent on file.
          </p>
        </Animate>

        {error && (
          <div className="rounded-[10px] border border-[#C4442E]/35 bg-[#C4442E]/10 text-[#8c2f1c] text-[13px] px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {loading && <p className="text-graphite text-[15px]">Loading&hellip;</p>}

        {!loading && !error && butlers.length === 0 && (
          <div className="border border-dashed border-black/15 rounded-[14px] bg-white text-center py-12 px-6">
            <p className="text-ink text-[16px] font-medium mb-1">No profiles up yet</p>
            <p className="text-graphite text-[14.5px] max-w-[46ch] mx-auto">
              {isShared
                ? 'Butlers are still filling these in. Post a job anyway — a manager will match you with someone.'
                : 'This page needs the shared database connected before it can show anyone.'}
            </p>
            <a
              href={withBase('request/')}
              className="inline-block mt-5 bg-ink text-white rounded-full px-6 py-3 text-[13.5px] font-medium uppercase tracking-[0.04em] hover:opacity-90 transition-opacity"
            >
              Post a Job
            </a>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {butlers.map((butler, i) => (
            <Animate key={butler.id} delay={60 + i * 50} direction="up">
              <article className="h-full bg-white border border-black/10 rounded-[16px] p-5 flex flex-col">
                <div className="flex items-center gap-3.5 mb-3.5">
                  {butler.photoUrl ? (
                    <img
                      src={butler.photoUrl}
                      alt={butler.displayName}
                      loading="lazy"
                      className="w-16 h-16 rounded-full object-cover border border-black/10 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-stone border border-black/10 shrink-0 flex items-center justify-center text-ink text-[18px] font-semibold">
                      {initials(butler.displayName)}
                    </div>
                  )}
                  <h2 className="text-ink text-[17px] font-semibold leading-tight">{butler.displayName}</h2>
                </div>

                {butler.bio && <p className="text-graphite text-[14.5px] leading-[1.6] flex-1">{butler.bio}</p>}

                {butler.jobTypePrefs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {butler.jobTypePrefs.map((pref) => (
                      <span
                        key={pref}
                        className="text-[11.5px] bg-sand border border-black/10 rounded-full px-[9px] py-[3px] text-[#44474C]"
                      >
                        {pref}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            </Animate>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
