import { useEffect, useMemo, useState } from 'react';
import { Job } from '@/lib/store';
import {
  approveAsIs,
  approveWithEdit,
  ContentPlatform,
  ContentQueueEntry,
  getContentQueue,
  markPostError,
  markPosted,
  rejectContent,
} from '@/lib/contentQueue';
import { publishToMeta } from '@/lib/marketingApi';
import { runSeasonalCheckIfDue } from '@/lib/seasonalTriggers';

const PLATFORM_LABEL: Record<ContentPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  nextdoor: 'Nextdoor',
};

const cardClass = 'bg-white border border-black/10 rounded-[14px] px-4 py-4';
const smallBtn =
  'h-[30px] px-3 rounded-[8px] text-[12px] font-medium transition-opacity disabled:opacity-40';
const primarySmallBtn = smallBtn + ' bg-[#0B0B0C] text-white hover:opacity-90';
const ghostSmallBtn = smallBtn + ' border border-black/15 text-[#17161B] hover:bg-black/5';

function fmtDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function jobLabel(job: Job | undefined): string {
  if (!job) return 'General / seasonal post';
  return `${job.service} — ${job.name}`;
}

export default function MarketingTab({ jobs }: { jobs: Job[] }) {
  const [, forceRender] = useState(0);
  const refresh = () => forceRender((n) => n + 1);

  useEffect(() => {
    runSeasonalCheckIfDue().then(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = getContentQueue();
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const pending = entries.filter((e) => e.status === 'pending_review');
  const scheduledOrPosted = entries.filter((e) => e.status === 'approved' || e.status === 'posted');
  const nextdoorReady = entries.filter((e) => e.platform === 'nextdoor' && e.status === 'approved');

  return (
    <div className="flex flex-col gap-9">
      <ContentQueueSection entries={pending} jobById={jobById} onChange={refresh} />
      <PerformanceSummarySection jobs={jobs} />
      <NextdoorStagingSection entries={nextdoorReady} jobById={jobById} onChange={refresh} />
      <ScheduledPostedSection entries={scheduledOrPosted} jobById={jobById} />
    </div>
  );
}

// ---------- 1. Content queue (pending review) ----------

function ContentQueueSection({
  entries,
  jobById,
  onChange,
}: {
  entries: ContentQueueEntry[];
  jobById: Map<string, Job>;
  onChange: () => void;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3.5">
        <h2 className="text-[17px] font-bold text-[#17161B]">Content queue</h2>
        <span className="text-[12.5px] text-black/45">{entries.length} awaiting review</span>
      </div>
      {entries.length ? (
        <div className="flex flex-col gap-2.5">
          {entries.map((entry) => (
            <PendingContentCard key={entry.id} entry={entry} job={entry.jobId ? jobById.get(entry.jobId) : undefined} onChange={onChange} />
          ))}
        </div>
      ) : (
        <EmptyState text="Nothing to review — drafts appear here when a job is marked completed." />
      )}
    </section>
  );
}

function PendingContentCard({ entry, job, onChange }: { entry: ContentQueueEntry; job: Job | undefined; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(entry.captionDrafts[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function publishIfNeeded(id: string, finalText: string) {
    if (entry.platform === 'nextdoor') return; // manual copy/paste — see Nextdoor staging area
    const result = await publishToMeta(entry.platform, finalText);
    if (result.success) {
      markPosted(id);
    } else {
      markPostError(id, result.error || 'Publish failed');
      setError(result.error || 'Publish failed');
    }
  }

  async function handleApproveAsIs() {
    setBusy(true);
    setError('');
    approveAsIs(entry.id, 0);
    try {
      await publishIfNeeded(entry.id, entry.captionDrafts[0] ?? '');
    } finally {
      setBusy(false);
      onChange();
    }
  }

  async function handleSaveEdit() {
    setBusy(true);
    setError('');
    approveWithEdit(entry.id, draftText);
    try {
      await publishIfNeeded(entry.id, draftText);
    } finally {
      setBusy(false);
      setEditing(false);
      onChange();
    }
  }

  function handleReject() {
    rejectContent(entry.id);
    onChange();
  }

  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[14.5px] font-bold text-[#17161B]">{jobLabel(job)}</div>
          <div className="text-[12.5px] text-black/45 mt-0.5">
            {PLATFORM_LABEL[entry.platform]} · drafted {fmtDate(entry.createdAt)}
          </div>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wide rounded-full px-[10px] py-[3px] whitespace-nowrap bg-[#71757C]/15 text-[#44474C]">
          Pending review
        </span>
      </div>

      {job?.details && <div className="text-[12.5px] text-[#55545C] mt-2 italic">"{job.details}"</div>}

      {!editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          {entry.captionDrafts.map((draft, i) => (
            <div key={i} className="rounded-[10px] border border-black/10 bg-[#F1EDE6] px-3 py-2.5 text-[13px] text-[#17161B] whitespace-pre-wrap">
              <div className="text-[11px] font-bold text-black/40 mb-1">Variant {i === 0 ? 'A' : 'B'}</div>
              {draft}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            className="w-full min-h-[110px] px-3 py-2.5 rounded-[10px] border border-black/12 bg-white text-[#17161B] text-[13px] focus:outline-none focus:border-black/40 focus:ring-2 focus:ring-black/10"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
          />
          <div className="flex gap-2 mt-1.5">
            <button type="button" onClick={() => setDraftText(entry.captionDrafts[0] ?? '')} className="text-[11.5px] text-black/45 hover:text-black/70">Use variant A</button>
            <button type="button" onClick={() => setDraftText(entry.captionDrafts[1] ?? '')} className="text-[11.5px] text-black/45 hover:text-black/70">Use variant B</button>
          </div>
        </div>
      )}

      <div className="text-[11.5px] text-black/40 mt-2 break-all">Tracking link: {entry.trackingLink}</div>

      {error && <div className="text-[12.5px] text-[#8c2f1c] mt-2">{error}</div>}

      <div className="flex gap-2 mt-3 flex-wrap">
        {!editing ? (
          <>
            <button onClick={handleApproveAsIs} disabled={busy} className={primarySmallBtn}>Approve as-is</button>
            <button onClick={() => setEditing(true)} disabled={busy} className={ghostSmallBtn}>Edit &amp; approve</button>
            <button onClick={handleReject} disabled={busy} className={ghostSmallBtn}>Reject</button>
          </>
        ) : (
          <>
            <button onClick={handleSaveEdit} disabled={busy || !draftText.trim()} className={primarySmallBtn}>Save &amp; approve</button>
            <button onClick={() => setEditing(false)} disabled={busy} className={ghostSmallBtn}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- 2. Scheduled / posted ----------

function ScheduledPostedSection({ entries, jobById }: { entries: ContentQueueEntry[]; jobById: Map<string, Job> }) {
  const [platformFilter, setPlatformFilter] = useState<'' | ContentPlatform>('');
  const [dateFilter, setDateFilter] = useState('');

  const filtered = entries.filter((e) => {
    if (platformFilter && e.platform !== platformFilter) return false;
    if (dateFilter) {
      const ref = e.postedAt || e.createdAt;
      if (!ref.startsWith(dateFilter)) return false;
    }
    return true;
  });

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3.5 flex-wrap gap-2">
        <h2 className="text-[17px] font-bold text-[#17161B]">Scheduled &amp; posted</h2>
        <div className="flex gap-2">
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value as '' | ContentPlatform)}
            className="h-[32px] rounded-[8px] border border-black/15 text-[12px] px-2 bg-white text-[#17161B]"
          >
            <option value="">All platforms</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="nextdoor">Nextdoor</option>
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-[32px] rounded-[8px] border border-black/15 text-[12px] px-2 bg-white text-[#17161B]"
          />
        </div>
      </div>
      {filtered.length ? (
        <div className="flex flex-col gap-2">
          {filtered.map((entry) => (
            <div key={entry.id} className={cardClass + ' flex items-center justify-between gap-3 flex-wrap'}>
              <div>
                <div className="text-[13.5px] font-semibold text-[#17161B]">
                  {PLATFORM_LABEL[entry.platform]} — {jobLabel(entry.jobId ? jobById.get(entry.jobId) : undefined)}
                </div>
                <div className="text-[12px] text-black/45 mt-0.5">{entry.captionFinal.slice(0, 90)}{entry.captionFinal.length > 90 ? '…' : ''}</div>
                {entry.postError && <div className="text-[12px] text-[#8c2f1c] mt-1">Last error: {entry.postError}</div>}
              </div>
              <span className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-[10px] py-[3px] whitespace-nowrap ${entry.status === 'posted' ? 'bg-[#2c7a41]/15 text-[#2c7a41]' : 'bg-[#0B0B0C]/8 text-[#17161B]'}`}>
                {entry.status === 'posted' ? `Posted ${fmtDate(entry.postedAt)}` : 'Approved'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="No approved or posted content yet." />
      )}
    </section>
  );
}

// ---------- 3. Performance summary ----------

function withinDays(iso: string, days: number): boolean {
  return Date.now() - +new Date(iso) <= days * 24 * 60 * 60 * 1000;
}

function PerformanceSummarySection({ jobs }: { jobs: Job[] }) {
  const sources = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => set.add(j.source || 'direct'));
    return Array.from(set).sort();
  }, [jobs]);

  const rows = sources.map((source) => {
    const jobsForSource = jobs.filter((j) => (j.source || 'direct') === source);
    return {
      source,
      last7: jobsForSource.filter((j) => withinDays(j.submittedAt, 7)).length,
      last30: jobsForSource.filter((j) => withinDays(j.submittedAt, 30)).length,
    };
  });

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3.5">
        <h2 className="text-[17px] font-bold text-[#17161B]">Job requests by source</h2>
      </div>
      {rows.length ? (
        <div className={cardClass + ' p-0 overflow-x-auto'}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-black/40 text-[11.5px] uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Last 7 days</th>
                <th className="px-4 py-3 font-semibold">Last 30 days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.source} className="border-t border-black/8">
                  <td className="px-4 py-2.5 font-medium text-[#17161B] capitalize">{row.source}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[#17161B]">{row.last7}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[#17161B]">{row.last30}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState text="No job requests yet." />
      )}
    </section>
  );
}

// ---------- 4. Nextdoor staging ----------

function NextdoorStagingSection({ entries, jobById, onChange }: { entries: ContentQueueEntry[]; jobById: Map<string, Job>; onChange: () => void }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3.5">
        <h2 className="text-[17px] font-bold text-[#17161B]">Nextdoor — ready to post</h2>
        <span className="text-[12.5px] text-black/45">No public posting API — copy and paste manually</span>
      </div>
      {entries.length ? (
        <div className="flex flex-col gap-2.5">
          {entries.map((entry) => (
            <NextdoorCard key={entry.id} entry={entry} job={entry.jobId ? jobById.get(entry.jobId) : undefined} onChange={onChange} />
          ))}
        </div>
      ) : (
        <EmptyState text="Nothing approved for Nextdoor right now." />
      )}
    </section>
  );
}

function NextdoorCard({ entry, job, onChange }: { entry: ContentQueueEntry; job: Job | undefined; onChange: () => void }) {
  const [copied, setCopied] = useState(false);
  const fullText = `${entry.captionFinal}\n\n${entry.trackingLink}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this text:', fullText);
    }
  }

  function handleMarkPosted() {
    markPosted(entry.id);
    onChange();
  }

  return (
    <div className={cardClass}>
      <div className="text-[13.5px] font-semibold text-[#17161B] mb-1">{jobLabel(job)}</div>
      <div className="text-[13px] text-[#17161B] whitespace-pre-wrap bg-[#F1EDE6] rounded-[10px] px-3 py-2.5">{fullText}</div>
      <div className="flex gap-2 mt-3">
        <button onClick={handleCopy} className={primarySmallBtn}>{copied ? 'Copied!' : 'Copy'}</button>
        <button onClick={handleMarkPosted} className={ghostSmallBtn}>Mark as posted</button>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-black/15 rounded-[12px] bg-white text-center text-black/45 text-[13.5px] py-7 px-5">
      {text}
    </div>
  );
}
