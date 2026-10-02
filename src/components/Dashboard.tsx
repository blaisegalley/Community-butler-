import { useState } from 'react';
import { loadMetrics, type Metrics } from '@/lib/metrics';
import { useQuery } from '@/lib/useQuery';
import { BarRows, Funnel, LinePair, SERIES, StatTile } from '@/components/Charts';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const STATUS_COLORS: Record<string, string> = {
  New: SERIES.two,
  Approved: SERIES.one,
  Assigned: SERIES.one,
  Completed: SERIES.three,
  Rejected: 'rgba(0,0,0,0.25)',
};

function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString()}`;
}

/*
 * The desk lives in a Claude artifact, whose sandbox cannot call Supabase —
 * it cannot reach any outside host at all. So the numbers travel by hand:
 * this copies the current window as JSON, and pasting it into the chat is
 * what refreshes the desk. A snapshot, carrying the moment it was taken,
 * so a stale desk never passes itself off as live.
 */
function deskSnapshot(m: Metrics): string {
  return JSON.stringify({ version: 1, capturedAt: new Date().toISOString(), ...m });
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-black/10 rounded-[14px] p-4">
      <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
      {note && <p className="text-[12px] text-black/45 mt-0.5 mb-3 max-w-[60ch]">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </div>
  );
}

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const { data, loading, error } = useQuery(() => loadMetrics(days), [days]);

  if (error) {
    return (
      <div className="rounded-[10px] border border-[#C4442E]/35 bg-[#C4442E]/10 text-[#8c2f1c] text-[13px] px-4 py-3">
        {error}
      </div>
    );
  }
  if (!data) {
    return <p className="text-[13px] text-black/45">{loading ? 'Loading…' : 'No data.'}</p>;
  }

  const m = data;

  return (
    <section>
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setDays(r.days)}
            className={`h-[32px] px-3.5 rounded-[8px] text-[12.5px] font-medium transition-colors ${
              days === r.days ? 'bg-ink text-white' : 'bg-white border border-black/10 text-ink hover:bg-black/5'
            }`}
          >
            {r.label}
          </button>
        ))}
        {loading && <span className="text-[12px] text-black/40 ml-2">refreshing&hellip;</span>}

        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(deskSnapshot(m));
              setCopied('done');
            } catch {
              setCopied('failed');
            }
            setTimeout(() => setCopied('idle'), 4000);
          }}
          className="h-[32px] px-3.5 ml-auto rounded-[8px] text-[12.5px] font-medium bg-white border border-black/10 text-ink hover:bg-black/5 transition-colors"
          title="Copies these numbers as text. Paste it to Claude to refresh the desk."
        >
          {copied === 'done' ? 'Copied — paste it to Claude' : copied === 'failed' ? "Couldn't copy" : 'Copy snapshot for the desk'}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <StatTile value={String(m.jobsPosted)} label={`Jobs posted (${m.rangeDays}d)`} />
        <StatTile value={String(m.jobsCompleted)} label={`Jobs completed (${m.rangeDays}d)`} />
        <StatTile
          value={money(m.completedValue)}
          label="Value of work completed"
          hint={`from ${m.valuedJobs} job${m.valuedJobs === 1 ? '' : 's'} with a budget`}
        />
        <StatTile
          value={m.viewsTracked ? String(m.totalViews) : '—'}
          label="Page views"
          hint={m.viewsTracked ? `last ${m.rangeDays} days` : 'tracking not set up yet'}
        />
        <StatTile
          value={String(m.awaitingApproval)}
          label="Waiting for you to approve"
          tone="attention"
        />
        <StatTile value={String(m.unclaimed)} label="Approved, nobody claimed yet" tone="attention" />
        <StatTile
          value={`${m.activeButlers}/${m.totalButlers}`}
          label="Butlers who took work"
          hint="active / signed up"
        />
        <StatTile
          value={m.avgRating ? `${m.avgRating.toFixed(1)}★` : '—'}
          label="Average rating"
          hint={m.ratedJobs ? `${m.ratedJobs} rated` : 'nothing rated yet'}
        />
      </div>

      <p className="text-[12px] text-black/45 mb-5 max-w-[80ch]">
        <strong>On the money figure:</strong> nothing is charged through this site &mdash; neighbors pay their
        butler directly. That number is the total of the budgets people entered on jobs that got finished, so it is
        the value of work done, not income. Jobs posted without a budget are not counted.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card title="Jobs per day" note="Posted versus finished, across the window.">
          <LinePair
            points={m.jobsByDay.map((d) => ({ day: d.day, a: d.posted, b: d.completed }))}
            labelA="Posted"
            labelB="Completed"
          />
        </Card>

        <Card
          title="Where people drop off"
          note={
            m.viewsTracked
              ? 'Each step as a share of the one above it. The biggest gap is where to put your effort.'
              : 'Starts at "posted" until page tracking is set up — without it there is no way to know how many people looked and left.'
          }
        >
          <Funnel steps={m.funnel} />
        </Card>

        <Card title="Most requested work" note="What neighbors actually ask for.">
          <BarRows rows={m.byService} />
        </Card>

        <Card title="Where jobs are now" note="Every job posted in the window, by status.">
          <div className="flex flex-col gap-2">
            {m.byStatus.map((s) => {
              const max = Math.max(1, ...m.byStatus.map((x) => x.count));
              return (
                <div key={s.status} className="flex items-center gap-3">
                  <div className="w-[120px] shrink-0 text-[12.5px] text-ink">{s.status}</div>
                  <div className="flex-1 h-[18px] bg-black/[0.04] rounded-[4px] overflow-hidden">
                    <div
                      className="h-full rounded-[4px]"
                      style={{
                        width: `${Math.max(2, (s.count / max) * 100)}%`,
                        background: STATUS_COLORS[s.status],
                      }}
                    />
                  </div>
                  <div className="w-[52px] shrink-0 text-right text-[12.5px] text-ink tabular-nums">{s.count}</div>
                </div>
              );
            })}
          </div>
        </Card>

        {m.viewsTracked && (
          <>
            <Card title="Visits per day" note="Signed-out visitors versus signed-in butlers.">
              <LinePair
                points={m.viewsByDay.map((d) => ({ day: d.day, a: d.visitor, b: d.butler }))}
                labelA="Visitors"
                labelB="Butlers"
              />
            </Card>
            <Card title="Most visited pages" note="Which part of the site people actually use.">
              <BarRows rows={m.viewsByPath} color={SERIES.three} />
            </Card>
          </>
        )}

        {!m.viewsTracked && (
          <Card title="Page views" note="Not set up yet.">
            <p className="text-[13px] text-graphite leading-relaxed">
              Run <code className="bg-black/5 px-1 rounded">003_analytics.sql</code> in the Supabase SQL editor and
              visits start being counted from that moment. There is no history to backfill &mdash; nothing was
              recording before.
            </p>
          </Card>
        )}
      </div>

      {m.medianHoursToApprove !== null && (
        <p className="text-[12.5px] text-black/45 mt-4">
          Typical time from a job being posted to a butler being on it:{' '}
          <strong className="text-ink">
            {m.medianHoursToApprove < 24
              ? `${m.medianHoursToApprove.toFixed(1)} hours`
              : `${(m.medianHoursToApprove / 24).toFixed(1)} days`}
          </strong>{' '}
          (median). This is the number a neighbor feels.
        </p>
      )}
    </section>
  );
}
