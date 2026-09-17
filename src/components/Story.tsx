import Animate from '@/components/Animate';

const PHOTO = 'https://d2ol7oe51mr4n9.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/799ab5f9-49b1-473b-a6c6-a863466ad769.jpg';

const ASSURANCES = [
  {
    title: 'A person reads every request',
    body: 'Nothing is matched automatically. A manager reviews the job before any butler is assigned to it.',
  },
  {
    title: 'Butlers are neighbors, not strangers',
    body: 'Every butler is a local high-school student who signed up and was approved before taking work.',
  },
  {
    title: 'You name the budget',
    body: 'You say what the job is worth to you when you post it. No surprise pricing, no subscription.',
  },
];

export default function Story() {
  return (
    <section id="story" className="w-full bg-white py-20 sm:py-28 scroll-mt-6">
      <div className="w-full max-w-[1800px] mx-auto px-5 sm:px-8 md:px-[82px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center mb-16 sm:mb-20">
          <Animate delay={0} direction="up">
            <p className="text-forest text-[13px] font-semibold tracking-[0.08em] uppercase mb-3">Our story</p>
            <h2 className="text-charcoal text-[32px] sm:text-[44px] font-normal leading-[1.05] tracking-[-0.01em] mb-5">
              The help was always next door
            </h2>
            <div className="text-graphite text-[16px] sm:text-[17px] leading-[1.65] flex flex-col gap-4">
              <p>
                Every street has the same two problems. Someone is out of hours and behind on the yard, the garage, the
                dog. And two doors down there is a teenager with time, energy, and no straightforward way to earn.
              </p>
              <p>
                Community Butler exists to close that gap. Neighbors post the work that piles up, and trained,
                motivated high-school butlers pick it up — close enough to walk, familiar enough to trust.
              </p>
              <p>
                The money stays on the block, the jobs actually get finished, and the kid doing them learns what it
                takes to show up and do good work.
              </p>
            </div>
          </Animate>

          <Animate delay={120} direction="up">
            <img
              src={PHOTO}
              alt="A butler finishing a lawn in the neighborhood"
              loading="lazy"
              className="w-full aspect-[4/3] object-cover rounded-[20px] border border-stone"
            />
          </Animate>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {ASSURANCES.map((item, i) => (
            <Animate key={item.title} delay={100 + i * 80} direction="up">
              <div className="h-full border-t border-stone pt-6">
                <h3 className="text-charcoal text-[17px] font-semibold leading-snug tracking-[-0.01em] mb-2">
                  {item.title}
                </h3>
                <p className="text-graphite text-[15px] leading-[1.6]">{item.body}</p>
              </div>
            </Animate>
          ))}
        </div>
      </div>
    </section>
  );
}
