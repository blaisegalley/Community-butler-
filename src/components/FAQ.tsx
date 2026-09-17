import Animate from '@/components/Animate';

const QUESTIONS = [
  {
    q: 'Who actually shows up?',
    a: 'A local high-school student who signed up as a butler and was approved by a manager before being allowed to take work. You will be told who is coming before they arrive.',
  },
  {
    q: 'What does it cost?',
    a: 'You suggest a budget when you post the job, and you settle up with your butler directly. There is no subscription, and nothing is charged through this site.',
  },
  {
    q: 'How soon can someone come?',
    a: 'It depends on the job and who is free nearby. A manager follows up after you post to confirm the details and a time — you are not left guessing.',
  },
  {
    q: 'Which areas do you cover?',
    a: 'We work in the neighborhoods immediately around us, since the whole idea is that your butler can walk over. Post a job with your area and we will tell you straight away if we can cover it.',
  },
  {
    q: 'Can I get the same butler again?',
    a: 'Usually, yes — plenty of jobs here are weekly. Mention it in the details when you post and we will try to keep the same person on it.',
  },
  {
    q: 'How do I become a butler?',
    a: 'Sign up on the For Butlers page. A manager reviews every application, and once you are approved you will start seeing jobs near you.',
  },
];

export default function FAQ() {
  return (
    <section className="w-full bg-sand py-20 sm:py-28">
      <div className="w-full max-w-[1800px] mx-auto px-5 sm:px-8 md:px-[82px]">
        <Animate delay={0} direction="up" className="max-w-[640px] mb-12 sm:mb-14">
          <p className="text-forest text-[13px] font-semibold tracking-[0.08em] uppercase mb-3">Questions</p>
          <h2 className="text-charcoal text-[32px] sm:text-[44px] font-normal leading-[1.05] tracking-[-0.01em]">
            Before you post
          </h2>
        </Animate>

        <div className="max-w-[860px] flex flex-col">
          {QUESTIONS.map((item, i) => (
            <Animate key={item.q} delay={80 + i * 50} direction="up">
              <details className="group border-b border-stone">
                <summary className="flex items-start justify-between gap-6 cursor-pointer list-none py-5 text-charcoal text-[17px] sm:text-[18px] font-medium leading-snug rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-sand">
                  {item.q}
                  <span aria-hidden="true" className="shrink-0 mt-1 text-graphite transition-transform duration-200 group-open:rotate-45">
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </summary>
                <p className="text-graphite text-[15px] sm:text-[16px] leading-[1.65] pb-5 pr-10 max-w-[68ch]">{item.a}</p>
              </details>
            </Animate>
          ))}
        </div>
      </div>
    </section>
  );
}
