import Animate from '@/components/Animate';

const STEPS = [
  {
    n: '01',
    title: 'Tell us what you need',
    body: 'Post the job in about two minutes — what it is, where you are, and a budget if you have one in mind.',
  },
  {
    n: '02',
    title: 'A manager matches you',
    body: 'Every request gets read by a real person, who lines it up with a butler living close enough to walk.',
  },
  {
    n: '03',
    title: 'It gets done',
    body: 'Your butler turns up and handles it. You settle up with them directly — nothing is charged through this site.',
  },
];

export default function HowItWorks() {
  return (
    <section className="w-full bg-sand py-20 sm:py-28">
      <div className="w-full max-w-[1800px] mx-auto px-5 sm:px-8 md:px-[82px]">
        <Animate delay={0} direction="up" className="max-w-[640px] mb-14 sm:mb-16">
          <p className="text-forest text-[13px] font-semibold tracking-[0.08em] uppercase mb-3">How it works</p>
          <h2 className="text-charcoal text-[32px] sm:text-[44px] font-normal leading-[1.05] tracking-[-0.01em] mb-4">
            Three steps, no back and forth
          </h2>
          <p className="text-graphite text-[16px] sm:text-[18px] leading-[1.4]">
            You never have to chase anyone down or negotiate over text.
          </p>
        </Animate>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 list-none">
          {STEPS.map((step, i) => (
            <Animate key={step.n} delay={100 + i * 80} direction="up">
              <li className="h-full bg-white border border-stone rounded-[20px] p-7 sm:p-8 flex flex-col">
                <span className="text-ember text-[13px] font-semibold tracking-[0.08em] mb-5">{step.n}</span>
                <h3 className="text-charcoal text-[20px] sm:text-[22px] font-semibold leading-tight tracking-[-0.01em] mb-3">
                  {step.title}
                </h3>
                <p className="text-graphite text-[15px] leading-[1.6]">{step.body}</p>
              </li>
            </Animate>
          ))}
        </ol>
      </div>
    </section>
  );
}
