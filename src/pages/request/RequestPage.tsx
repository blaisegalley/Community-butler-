import { FormEvent, useState } from 'react';
import Animate from '@/components/Animate';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { addJob } from '@/lib/store';
import NotifyButton from '@/components/NotifyButton';
import { fieldWrap, inputClass, labelClass, primaryBtn, selectClass, textareaClass } from '@/components/FormControls';

const SERVICES = ['Yard work', 'Snow shoveling', 'Moving help', 'Junk hauling', 'Cleanout', 'Dog walking', 'Odd job'];

export default function RequestPage() {
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    service: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    date: '',
    budget: '',
    details: '',
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Saving a request now crosses the network, so "sent" has to mean the
  // database actually has it. Showing the thank-you first and hoping would
  // leave a neighbour expecting a butler who is never coming.
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!e.currentTarget.reportValidity()) return;
    setSubmitting(true);
    setError('');
    try {
      const job = await addJob(form);
      setSubmittedJobId(job.id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'We could not send that request. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-sand flex flex-col">
      <SiteHeader />

      <main className="flex-1 w-full max-w-[720px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <Animate delay={0} direction="up">
          <h1 className="text-ink text-[32px] sm:text-[44px] font-normal leading-[1.05] mb-3">
            Need a <em className="not-italic text-graphite">job</em> done?
          </h1>
          <p className="text-graphite text-[16px] sm:text-[18px] leading-[1.4] mb-2">
            Tell us what you need and a manager will confirm the details before any Butler is booked.
          </p>
          <a href="tel:+12246339328" className="inline-flex items-center gap-2 text-ink text-[14.5px] font-medium mb-10">
            Or call us (224) 633-9328
          </a>
        </Animate>

        {submittedJobId ? (
          <Animate delay={0} direction="up">
            <div className="rounded-[16px] border border-black/10 bg-white p-6 sm:p-8 text-center">
              <h3 className="text-ink text-[18px] font-semibold mb-1">Request sent</h3>
              <p className="text-graphite text-[14.5px]">
                Thanks — a manager will review your request and follow up shortly. Nothing has been charged.
              </p>
              <div className="mt-6 pt-6 border-t border-black/10 flex flex-col items-center text-center">
                <NotifyButton
                  target={{ jobId: submittedJobId }}
                  label="Notify me about this job"
                  onLabel="You'll be notified about this job."
                  hint="We'll let you know when a Butler is confirmed, and again the day before."
                />
              </div>
            </div>
          </Animate>
        ) : (
          <Animate delay={150} direction="up">
            <form onSubmit={handleSubmit} noValidate>
              <div className={fieldWrap}>
                <label className={labelClass} htmlFor="service">What do you need done?</label>
                <select
                  id="service"
                  required
                  className={selectClass}
                  value={form.service}
                  onChange={(e) => update('service', e.target.value)}
                >
                  <option value="" disabled>Select a service</option>
                  {SERVICES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className={fieldWrap + ' mb-0'}>
                  <label className={labelClass} htmlFor="name">Your name</label>
                  <input id="name" required className={inputClass} value={form.name} onChange={(e) => update('name', e.target.value)} />
                </div>
                <div className={fieldWrap + ' mb-0'}>
                  <label className={labelClass} htmlFor="phone">Your phone number</label>
                  <input id="phone" type="tel" required className={inputClass} value={form.phone} onChange={(e) => update('phone', e.target.value)} />
                </div>
              </div>

              <div className={fieldWrap}>
                <label className={labelClass} htmlFor="email">Email <span className="text-black/40 font-normal">(optional)</span></label>
                <input id="email" type="email" className={inputClass} value={form.email} onChange={(e) => update('email', e.target.value)} />
              </div>

              <div className={fieldWrap}>
                <label className={labelClass} htmlFor="address">Address or area</label>
                <input id="address" required className={inputClass} value={form.address} onChange={(e) => update('address', e.target.value)} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className={fieldWrap + ' mb-0'}>
                  <label className={labelClass} htmlFor="date">Preferred date <span className="text-black/40 font-normal">(optional)</span></label>
                  <input id="date" type="date" className={inputClass} value={form.date} onChange={(e) => update('date', e.target.value)} />
                </div>
                <div className={fieldWrap + ' mb-0'}>
                  <label className={labelClass} htmlFor="budget">Budget in dollars <span className="text-black/40 font-normal">(optional)</span></label>
                  <input id="budget" type="number" min={0} placeholder="$" className={inputClass} value={form.budget} onChange={(e) => update('budget', e.target.value)} />
                </div>
              </div>

              <div className={fieldWrap}>
                <label className={labelClass} htmlFor="details">Details</label>
                <textarea id="details" required placeholder="Tell us more about the job..." className={textareaClass} value={form.details} onChange={(e) => update('details', e.target.value)} />
              </div>

              {error && (
                <div className="rounded-[10px] border border-[#C4442E]/35 bg-[#C4442E]/10 text-[#8c2f1c] text-[13px] px-4 py-3 mb-4">
                  {error}
                </div>
              )}
              <button type="submit" className={primaryBtn} disabled={submitting}>
                {submitting ? 'Sending\u2026' : 'Send request'}
              </button>
              <p className="text-black/45 text-[13px] text-center mt-4">
                Nothing is charged now — a manager approves your request first.
              </p>
            </form>
          </Animate>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
