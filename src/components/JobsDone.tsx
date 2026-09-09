import Animate from '@/components/Animate';

interface Job {
  image: string;
  title: string;
  area: string;
  description: string;
}

const JOBS: Job[] = [
  {
    image: 'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/hf_20260908_153025_f52bc509-6a82-47ee-b208-9360eaa7dac3.png',
    title: 'Yard work',
    area: 'Arlington Heights',
    description: 'A weekly lawn-mowing job, picked up by a butler two streets over. Trimmed, mowed, and cleared in under an hour.',
  },
  {
    image: 'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/hf_20260908_153025_36ca605d-0cdc-44f3-b6c5-44d0cc7762e0.png',
    title: 'Grocery help',
    area: 'Arlington Heights',
    description: 'A standing request for help carrying groceries up the porch steps — the same butler shows up every Saturday.',
  },
  {
    image: 'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/hf_20260908_153024_4ad0cea5-dd11-435d-9576-d283dccca068.png',
    title: 'Moving day',
    area: 'Palatine',
    description: 'An extra pair of hands for a local move — boxes loaded, furniture wrapped, done before the truck rental was up.',
  },
  {
    image: 'https://d8j0ntlcm91z4.cloudfront.net/user_3InUJHYWQdfJ9vDYlt0pJC4Yt0u/hf_20260908_153024_1647861a-9f59-4482-81c6-58b77f423bf4.png',
    title: 'Dog walking',
    area: 'Arlington Heights',
    description: 'A recurring evening walk for a neighbor who works late — booked straight through the app, same butler each time.',
  },
];

export default function JobsDone() {
  return (
    <section className="w-full bg-sand py-20 sm:py-28">
      <div className="w-full max-w-[1800px] mx-auto px-5 sm:px-8 md:px-[82px]">
        <Animate delay={0} direction="up" className="max-w-[640px] mb-14 sm:mb-16">
          <p className="text-forest text-[13px] font-semibold tracking-[0.08em] uppercase mb-3">
            Jobs done
          </p>
          <h2 className="text-charcoal text-[32px] sm:text-[44px] font-normal leading-[1.05] tracking-[-0.01em] mb-4">
            Real work, finished by real neighbors
          </h2>
          <p className="text-graphite text-[16px] sm:text-[18px] leading-[1.4]">
            A running look at what butlers are getting done right now, area by area.
          </p>
        </Animate>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-7">
          {JOBS.map((job, i) => (
            <Animate key={job.title} delay={150 + i * 120} direction="up">
              <div className="group rounded-[20px] overflow-hidden bg-white border border-stone h-full flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(22,26,23,0.10)]">
                <div className="aspect-[4/3] w-full overflow-hidden bg-stone">
                  <img
                    src={job.image}
                    alt={job.title}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                  />
                </div>
                <div className="p-5 flex flex-col gap-2 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-charcoal text-[17px] font-semibold leading-tight tracking-[-0.01em]">{job.title}</h3>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-graphite bg-[#EDEAE0] border border-stone px-[10px] py-[4px] rounded-full whitespace-nowrap">
                      {job.area}
                    </span>
                  </div>
                  <p className="text-graphite text-[14px] leading-[1.5]">{job.description}</p>
                </div>
              </div>
            </Animate>
          ))}
        </div>
      </div>
    </section>
  );
}
