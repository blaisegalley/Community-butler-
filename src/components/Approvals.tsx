import { FormEvent, useEffect, useState } from 'react';
import { useQuery } from '@/lib/useQuery';
import { isShared } from '@/lib/store';
import { decide, getAgentTasks, getProspects, runAgentsNow, setProspectStatus, submitLead, submitProspect } from '@/lib/agents/api';
import type { AgentTask, Draft, Lead, ProspectInput, RunSummary } from '@/lib/agents/api';
import { REJECT_REASONS } from '@agents/decisions.ts';
import { inputClass, labelClass, textareaClass } from '@/components/FormControls';

/*
 * The one inbox from the design: every draft the agents produce lands
 * here, and nothing they draft reaches a neighbor, a student or the
 * public until someone presses the button on its card.
 */

const AGENT_LABEL: Record<Draft['agent'], string> = {
  dispatcher: 'Dispatcher',
  intake: 'Intake',
  safety: 'Safety',
  matchmaker: 'Matchmaker',
  lead_scout: 'Lead Scout',
  voice: 'Voice',
  care: 'Care',
  recruiter: 'Recruiter',
  b2b: 'B2B',
  web_studio: 'Web Studio',
  analyst: 'Analyst',
};

const CHANNEL_LABEL: Record<Draft['channel'], string> = {
  email: 'Email to the neighbor',
  groupme: 'GroupMe post',
  nextdoor: 'Nextdoor reply — you post it from your account',
  instagram: 'Instagram reply — you post it',
  butler_app: 'Message to the Butler in the app',
  internal: 'Internal note — not sent to anyone',
  none: '',
};

const FLAG_LABEL: Record<string, string> = {
  template: 'Template draft',
  needs_polish: 'Needs a human touch',
  low_confidence: 'Low confidence',
  blocked_message: 'Edit before sending',
  two_admins_to_override: '2 admins to override',
  no_email: 'No email on file',
  budget_below_floor: 'Budget below floor',
  town_unknown: 'Town unknown',
  missing_details: 'Missing details',
  supply_gap: 'Not enough Butlers',
  too_similar_to_past_reply: 'Too similar to a past reply',
  incident: 'Incident',
  outside_area: 'Outside our towns?',
  budget_unknown: 'No budget given',
  long: 'Long',
};

const TIER_STYLE = {
  Green: 'bg-[#2c7a41]/12 text-[#215c31]',
  Yellow: 'bg-[#b7791f]/15 text-[#7a5212]',
  Red: 'bg-[#C4442E]/12 text-[#8c2f1c]',
};

function approveLabel(draft: Draft): string {
  switch (draft.action.kind) {
    case 'approve_job': return 'Approve job';
    case 'decline_job': return draft.action.notifyNeighbor ? 'Decline and email' : 'Close request';
    case 'message_neighbor': return 'Send email';
    case 'assign_butler': return 'Assign';
    case 'post_groupme': return 'Post to GroupMe';
    case 'mark_posted': return 'I posted it';
    case 'notify_butlers': return draft.action.butlerIds.length > 1 ? `Send to ${draft.action.butlerIds.length} Butlers` : 'Send to Butler';
    case 'send_email': return 'Send email';
    case 'manual_post': return 'I posted it';
    case 'apply_config': return 'Apply change';
    case 'acknowledge': return 'Got it';
  }
}

/** What the text box is for. Emails to businesses name who they go to. */
function textLabel(draft: Draft): string {
  if (draft.action.kind === 'send_email') return `Email to ${draft.action.to}`;
  if (draft.action.kind === 'manual_post') return `Post on ${draft.action.where} — you post it from your account`;
  if (draft.action.kind === 'post_groupme' && !draft.action.jobId) return 'GroupMe post to the Butler group';
  return CHANNEL_LABEL[draft.channel];
}

function dueIn(deadline: string | null): string {
  if (!deadline) return '';
  const hours = (+new Date(deadline) - Date.now()) / 3600000;
  if (hours < 1) return 'due within the hour';
  if (hours < 24) return `due in ${Math.round(hours)}h`;
  return `due in ${Math.round(hours / 24)}d`;
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function summaryLine(summary: RunSummary): string {
  const parts = [
    summary.awaitingApproval ? `${summary.awaitingApproval} new card${summary.awaitingApproval > 1 ? 's' : ''}` : '',
    summary.closed ? `${summary.closed} closed with no card needed` : '',
    summary.expired ? `${summary.expired} expired` : '',
    summary.failed ? `${summary.failed} failed` : '',
  ].filter(Boolean);
  return `${parts.length ? parts.join(', ') : 'Nothing new'}.${summary.templateMode ? ' Drafts came from templates.' : ''} ${summary.notes.join(' ')}`.trim();
}

const smallBtn = 'h-[32px] px-3.5 rounded-[8px] text-[12.5px] font-medium transition-colors disabled:opacity-40';
const darkBtn = `${smallBtn} bg-ink text-white hover:opacity-90`;
const lightBtn = `${smallBtn} border border-black/15 text-ink hover:bg-black/5`;

export default function Approvals() {
  const query = useQuery(getAgentTasks);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string>('');
  const [runError, setRunError] = useState('');

  async function run() {
    setRunning(true);
    setRunError('');
    try {
      setLastRun(summaryLine(await runAgentsNow()));
    } catch (cause) {
      setRunError(cause instanceof Error ? cause.message : 'The agents could not run.');
    } finally {
      setRunning(false);
    }
  }

  // In demo mode there is no schedule, so opening the inbox is the schedule.
  useEffect(() => {
    if (!isShared) void run();
  }, []);

  const tasks = query.data ?? [];
  const now = Date.now();
  const awaiting = tasks.filter((t) => t.state === 'awaiting_approval' && t.draft);
  // Most urgent first, then whichever expires soonest.
  const inbox = awaiting
    .filter((t) => +new Date(t.runAfter) <= now)
    .sort((a, b) => b.priority - a.priority || (a.deadline ?? '').localeCompare(b.deadline ?? ''));
  const snoozed = awaiting.filter((t) => +new Date(t.runAfter) > now);
  const problems = tasks.filter((t) => t.state === 'dead_letter');
  const working = tasks.filter((t) => ['queued', 'running', 'retry'].includes(t.state));
  const recent = tasks
    .filter((t) => ['done', 'closed', 'expired'].includes(t.state))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 15);

  return (
    <section className="flex flex-col gap-5">
      <div className="bg-white border border-black/10 rounded-[14px] px-4 py-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="max-w-[62ch]">
            <h3 className="text-[14.5px] font-bold text-ink">Agent drafts waiting on you</h3>
            <p className="text-[12.5px] text-black/50 mt-0.5">
              Agents sort requests, match Butlers and draft messages. Nothing is sent or changed until you approve it here.
              {isShared ? ' They run every 5 minutes.' : ' Demo mode: drafts come from templates and no messages are sent.'}
            </p>
          </div>
          <button onClick={run} disabled={running} className={darkBtn}>
            {running ? 'Running…' : 'Run agents now'}
          </button>
        </div>
        {lastRun && <p className="text-[12.5px] text-graphite">Last run: {lastRun}</p>}
        {runError && <p className="text-[12.5px] text-[#8c2f1c]">{runError}</p>}
        <LeadForm />
      </div>

      {query.error && (
        <div className="rounded-[10px] border border-[#C4442E]/35 bg-[#C4442E]/10 text-[#8c2f1c] text-[13px] px-4 py-3">{query.error}</div>
      )}

      {problems.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-[12px] font-semibold uppercase tracking-wide text-[#8c2f1c]">Failed {problems.length} times — needs a look</h4>
          {problems.map((task) => <ProblemCard key={task.id} task={task} />)}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {inbox.length ? (
          inbox.map((task) => <ApprovalCard key={task.id} task={task} />)
        ) : (
          <div className="border border-dashed border-black/15 rounded-[12px] bg-white text-center text-black/45 text-[13.5px] py-7 px-5">
            {query.loading ? 'Loading the queue…' : 'Inbox zero. New job requests and pasted posts show up here as drafts.'}
          </div>
        )}
      </div>

      {(working.length > 0 || snoozed.length > 0) && (
        <p className="text-[12.5px] text-black/45">
          {working.length > 0 && `${working.length} task${working.length > 1 ? 's' : ''} queued for the next run. `}
          {snoozed.length > 0 && `${snoozed.length} snoozed until tomorrow.`}
        </p>
      )}

      <Prospects />

      {recent.length > 0 && (
        <details className="bg-white border border-black/10 rounded-[14px] px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-medium text-ink">Recently handled ({recent.length})</summary>
          <div className="flex flex-col gap-1.5 mt-3">
            {recent.map((task) => {
              const sent = [...task.decisions].reverse().find((d) => d.decision === 'approve' || d.decision === 'edit');
              return (
                <div key={task.id} className="text-[12.5px] border-t border-black/5 pt-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink min-w-0">
                      <span className="font-medium">{task.draft?.title ?? task.type.replace(/_/g, ' ').toLowerCase()}</span>
                      <span className="text-black/45"> — {task.state === 'done' ? task.closedReason || 'Done' : task.closedReason || task.state}</span>
                    </span>
                    <span className="text-black/40 whitespace-nowrap">{ago(task.updatedAt)}</span>
                  </div>
                  {/* Kept visible so a message that has to be sent by hand can still be copied. */}
                  {sent?.finalText && <p className="text-black/50 mt-1 whitespace-pre-wrap select-all">{sent.finalText}</p>}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}

const SEGMENT_LABEL: Record<string, string> = {
  realtor: 'Real estate agent',
  property_manager: 'Property manager',
  hoa: 'HOA',
  small_business: 'Small business',
};

const STATUS_LABEL: Record<Lead['status'], string> = {
  new: 'Not contacted yet',
  contacted: 'Emailed',
  replied: 'Replied',
  won: 'Won',
  dropped: 'Closed',
};

/**
 * Businesses to reach out to and website inquiries. The agents draft the
 * emails as cards above; this is where you record how each one answered,
 * which is what stops follow-ups and starts a website build brief.
 */
function Prospects() {
  const query = useQuery(getProspects);
  const [adding, setAdding] = useState(false);
  const prospects = query.data ?? [];

  return (
    <div className="bg-white border border-black/10 rounded-[14px] px-4 py-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="max-w-[62ch]">
          <h3 className="text-[14.5px] font-bold text-ink">Businesses and website inquiries</h3>
          <p className="text-[12.5px] text-black/50 mt-0.5">
            Add a realtor, property manager, HOA or small business and the agents draft the outreach and follow-ups. Website inquiries get a proposal at the right package.
          </p>
        </div>
        {!adding && <button onClick={() => setAdding(true)} className={lightBtn}>Add a business</button>}
      </div>
      {adding && <ProspectForm onDone={() => setAdding(false)} />}
      {query.error && <p className="text-[12.5px] text-[#8c2f1c]">{query.error}</p>}
      {prospects.length > 0 && (
        <div className="flex flex-col">
          {prospects.map((lead) => <ProspectRow key={lead.id} lead={lead} />)}
        </div>
      )}
    </div>
  );
}

function ProspectRow({ lead }: { lead: Lead }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function mark(status: 'replied' | 'won' | 'dropped') {
    setBusy(true);
    setError('');
    try {
      await setProspectStatus(lead.id, status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }
  const open = lead.status === 'new' || lead.status === 'contacted' || lead.status === 'replied';
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap border-t border-black/5 py-2.5 text-[12.5px]">
      <div className="min-w-0">
        <div className="text-ink font-medium">
          {lead.details.org || 'Unnamed'}{' '}
          <span className="text-black/45 font-normal">
            · {lead.channel === 'web' ? 'Website inquiry' : SEGMENT_LABEL[lead.details.segment ?? ''] ?? 'Business'}
            {lead.town ? ` · ${lead.town}` : ''}
          </span>
        </div>
        <div className="text-black/45">{STATUS_LABEL[lead.status]}{lead.details.email ? ` · ${lead.details.email}` : ''}</div>
        {error && <div className="text-[#8c2f1c]">{error}</div>}
      </div>
      {open && (
        <div className="flex gap-1.5 flex-wrap">
          {lead.status !== 'replied' && <button disabled={busy} onClick={() => mark('replied')} className={lightBtn}>They replied</button>}
          <button disabled={busy} onClick={() => mark('won')} className={lightBtn}>Won</button>
          <button disabled={busy} onClick={() => mark('dropped')} className={lightBtn}>Not interested</button>
        </div>
      )}
    </div>
  );
}

function ProspectForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<ProspectInput>({
    kind: 'b2b', org: '', segment: 'realtor', contactName: '', email: '', town: '', budget: '', website: '', notes: '', author: rememberedName(),
  });
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof ProspectInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.org.trim() || !form.author.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      try {
        localStorage.setItem(REPLY_AS_KEY, form.author.trim());
      } catch {
        /* not remembered next time */
      }
      const summary = await submitProspect(form);
      setStatus({ kind: 'ok', text: summary.awaitingApproval ? 'Draft ready — see the new card above.' : `No draft yet. ${summaryLine(summary)}` });
      setForm((f) => ({ ...f, org: '', contactName: '', email: '', town: '', budget: '', website: '', notes: '' }));
    } catch (cause) {
      setStatus({ kind: 'error', text: cause instanceof Error ? cause.message : 'Could not save that.' });
    } finally {
      setBusy(false);
    }
  }

  const field = (id: keyof ProspectInput, label: string, props: Record<string, unknown> = {}) => (
    <div className="flex-1 min-w-[180px]">
      <label className={labelClass} htmlFor={`prospect-${id}`}>{label}</label>
      <input id={`prospect-${id}`} className={inputClass} value={form[id]} onChange={set(id)} {...props} />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-black/10 pt-3">
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label className={labelClass} htmlFor="prospect-kind">What is it?</label>
          <select id="prospect-kind" className={inputClass} value={form.kind} onChange={set('kind')}>
            <option value="b2b">A business to reach out to</option>
            <option value="web">A website inquiry</option>
          </select>
        </div>
        {form.kind === 'b2b' && (
          <div className="flex-1 min-w-[180px]">
            <label className={labelClass} htmlFor="prospect-segment">Kind of business</label>
            <select id="prospect-segment" className={inputClass} value={form.segment} onChange={set('segment')}>
              {Object.entries(SEGMENT_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
        )}
        {field('org', 'Business name', { required: true, placeholder: 'Oak Street Realty' })}
      </div>
      <div className="flex gap-3 flex-wrap">
        {field('contactName', 'Contact name', { placeholder: 'Dana Lee' })}
        {field('email', 'Their email', { type: 'email', placeholder: 'dana@example.com' })}
        {field('town', 'Town', { placeholder: 'Barrington' })}
      </div>
      {form.kind === 'web' && (
        <div className="flex gap-3 flex-wrap">
          {field('budget', 'Budget, if they said', { placeholder: '$1,000' })}
          {field('website', 'Current website, if any', { placeholder: 'example.com' })}
        </div>
      )}
      <div>
        <label className={labelClass} htmlFor="prospect-notes">{form.kind === 'web' ? 'What they want the site to do' : 'What you know about them'}</label>
        <textarea id="prospect-notes" className={`${textareaClass} min-h-[80px]`} value={form.notes} onChange={set('notes')}
          placeholder={form.kind === 'web' ? 'Bakery in Barrington, wants a menu, photos and a way to order cakes online' : 'Lists about 6 homes a month around Barrington; saw their yard sign on Main St'} />
      </div>
      {field('author', 'Write it as (your first name)', { required: true, placeholder: 'Blaise' })}
      {status && <p className={`text-[12.5px] ${status.kind === 'ok' ? 'text-[#215c31]' : 'text-[#8c2f1c]'}`}>{status.text}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !form.org.trim() || !form.author.trim()} className={darkBtn}>{busy ? 'Drafting\u2026' : 'Add and draft'}</button>
        <button type="button" onClick={onDone} className={lightBtn}>Close</button>
      </div>
    </form>
  );
}

const REPLY_AS_KEY = 'cb.replyAs.v1';

function rememberedName(): string {
  try {
    return localStorage.getItem(REPLY_AS_KEY) ?? '';
  } catch {
    return '';
  }
}

function LeadForm() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  // Nextdoor replies are posted from an admin's own account, so they are
  // written as that person. Remembered per browser, since each admin has their own.
  const [replyAs, setReplyAs] = useState(rememberedName);
  const [channel, setChannel] = useState<'nextdoor' | 'instagram' | 'email' | 'other'>('nextdoor');
  const [town, setTown] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim() || !replyAs.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      try {
        localStorage.setItem(REPLY_AS_KEY, replyAs.trim());
      } catch {
        /* not remembered next time; nothing else depends on it */
      }
      const summary = await submitLead({ channel, text: text.trim(), town: town.trim(), author: replyAs.trim() });
      setText('');
      setTown('');
      setStatus({ kind: 'ok', text: summary.awaitingApproval ? 'Reply drafted — see the new card below.' : `No reply drafted. ${summaryLine(summary)}` });
    } catch (cause) {
      setStatus({ kind: 'error', text: cause instanceof Error ? cause.message : 'Could not save that post.' });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${lightBtn} self-start`}>
        Paste a Nextdoor post
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-black/10 pt-3">
      <div>
        <label className={labelClass} htmlFor="lead-text">Post or message someone wrote</label>
        <textarea id="lead-text" className={textareaClass} value={text} onChange={(e) => setText(e.target.value)} placeholder="Anyone know a high schooler who could rake leaves this weekend? Barrington" />
      </div>
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className={labelClass} htmlFor="lead-channel">Where it was posted</label>
          <select id="lead-channel" className={inputClass} value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
            <option value="nextdoor">Nextdoor</option>
            <option value="instagram">Instagram</option>
            <option value="email">Email</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className={labelClass} htmlFor="lead-town">Town (if the post doesn't say)</label>
          <input id="lead-town" className={inputClass} value={town} onChange={(e) => setTown(e.target.value)} placeholder="Barrington" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className={labelClass} htmlFor="lead-reply-as">Reply as (your first name)</label>
          <input id="lead-reply-as" required className={inputClass} value={replyAs} onChange={(e) => setReplyAs(e.target.value)} placeholder="Blaise" />
        </div>
      </div>
      {status && <p className={`text-[12.5px] ${status.kind === 'ok' ? 'text-[#215c31]' : 'text-[#8c2f1c]'}`}>{status.text}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !text.trim() || !replyAs.trim()} className={darkBtn}>{busy ? 'Drafting…' : 'Draft a reply'}</button>
        <button type="button" onClick={() => setOpen(false)} className={lightBtn}>Close</button>
      </div>
    </form>
  );
}

function ProblemCard({ task }: { task: AgentTask }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="bg-white border border-[#C4442E]/30 rounded-[12px] px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
      <div className="text-[12.5px]">
        <div className="font-semibold text-ink">{task.type.replace(/_/g, ' ').toLowerCase()} · {task.subjectType} {task.subjectId.slice(0, 8)}</div>
        <div className="text-[#8c2f1c] mt-0.5">{task.lastError || 'Unknown error'}</div>
      </div>
      <button disabled={busy} onClick={async () => { setBusy(true); await decide(task.id, 'retry'); setBusy(false); }} className={lightBtn}>
        Retry
      </button>
    </div>
  );
}

function ApprovalCard({ task }: { task: AgentTask }) {
  const draft = task.draft!;
  const [text, setText] = useState(draft.text);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const sendsText = draft.channel !== 'none';
  const overrides = task.decisions.filter((d) => d.decision === 'override');

  async function act(decision: Parameters<typeof decide>[1], extra: { reason?: string; text?: string } = {}) {
    setBusy(true);
    setResult(null);
    try {
      setResult(await decide(task.id, decision, extra));
    } catch (cause) {
      setResult({ ok: false, message: cause instanceof Error ? cause.message : 'That did not work. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      document.getElementById(`draft-${task.id}`)?.focus();
    }
  }

  return (
    <article className={`bg-white border rounded-[14px] px-4 py-4 ${task.priority >= 3 ? 'border-[#C4442E]/40' : 'border-black/10'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide bg-ink text-white rounded-[6px] px-2 py-[2px]">{AGENT_LABEL[draft.agent]}</span>
            <span className={`text-[11px] font-bold rounded-full px-[9px] py-[2px] ${TIER_STYLE[draft.safety.tier]}`}>{draft.safety.tier}</span>
            {task.priority >= 3 && <span className="text-[11px] font-bold text-[#8c2f1c]">Urgent</span>}
            {draft.flags.map((flag) => (
              <span key={flag} className="text-[11px] bg-sand border border-black/10 rounded-full px-[8px] py-[1px] text-[#44474C]">{FLAG_LABEL[flag] ?? flag}</span>
            ))}
          </div>
          <h4 className="text-[14.5px] font-bold text-ink">{draft.title}</h4>
        </div>
        <span className="text-[12px] text-black/40 whitespace-nowrap">{dueIn(task.deadline)}</span>
      </div>

      <p className="text-[13px] text-graphite mt-2 max-w-[75ch]">{draft.summary}</p>

      <dl className="grid gap-x-4 gap-y-1 mt-2.5 text-[12.5px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {draft.facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-black/40">{label}</dt>
            <dd className="text-ink font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {draft.safety.messageProblems.length > 0 && (
        <div className="rounded-[8px] border border-[#C4442E]/35 bg-[#C4442E]/10 text-[#8c2f1c] text-[12.5px] px-3 py-2 mt-3">
          Edit before sending: {draft.safety.messageProblems.join('; ')}
        </div>
      )}
      {draft.voice && draft.voice.fixNotes.length > 0 && (
        <p className="text-[12px] text-[#7a5212] mt-2">Voice notes: {draft.voice.fixNotes.slice(0, 3).join(' ')}</p>
      )}

      {sendsText && (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
            <label htmlFor={`draft-${task.id}`} className="text-[12px] font-medium text-[#44474C]">{textLabel(draft)}</label>
            <div className="flex gap-1.5">
              {draft.variants.length > 1 && draft.variants.map((variant, i) => (
                <button key={i} type="button" onClick={() => setText(variant)} className={`h-[26px] px-2.5 rounded-[6px] text-[11.5px] border ${text === variant ? 'bg-ink text-white border-ink' : 'border-black/15 text-ink hover:bg-black/5'}`}>
                  Variant {i + 1}
                </button>
              ))}
              {draft.channel !== 'internal' && (
                <button type="button" onClick={copy} className="h-[26px] px-2.5 rounded-[6px] text-[11.5px] border border-black/15 text-ink hover:bg-black/5">
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>
          <textarea
            id={`draft-${task.id}`}
            className={`${textareaClass} ${draft.channel === 'internal' && text.length > 400 ? 'min-h-[260px] font-mono text-[12.5px]' : 'min-h-[96px] text-[13.5px]'}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={draft.channel === 'internal'}
          />
        </div>
      )}

      {result && (
        <p className={`text-[12.5px] mt-2.5 ${result.ok ? 'text-[#215c31]' : 'text-[#8c2f1c]'}`}>{result.message}</p>
      )}
      {overrides.length > 0 && (
        <p className="text-[12px] text-[#7a5212] mt-2">Override requested by {overrides.map((o) => o.admin).join(', ')}. A second admin has to override too.</p>
      )}

      {!rejecting ? (
        <div className="flex gap-2 mt-3 flex-wrap">
          <button disabled={busy} onClick={() => act('approve', { text })} className={darkBtn}>
            {busy ? 'Working…' : text !== draft.text && sendsText ? `${approveLabel(draft)} (edited)` : approveLabel(draft)}
          </button>
          <button disabled={busy} onClick={() => setRejecting(true)} className={lightBtn}>Reject</button>
          <button disabled={busy} onClick={() => act('snooze')} className={lightBtn}>Snooze a day</button>
          {draft.flags.includes('two_admins_to_override') && (
            <button disabled={busy} onClick={() => act('override')} className={lightBtn}>Override: approve the job anyway</button>
          )}
        </div>
      ) : (
        <div className="flex gap-2 mt-3 flex-wrap items-center">
          <label htmlFor={`reason-${task.id}`} className="sr-only">Why reject it?</label>
          <select id={`reason-${task.id}`} value={reason} onChange={(e) => setReason(e.target.value)} className="h-[32px] rounded-[8px] border border-black/15 text-[12.5px] px-2 bg-white text-ink">
            <option value="" disabled>Why? (helps the agents learn)</option>
            {REJECT_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <button disabled={busy || !reason} onClick={() => act('reject', { reason })} className={darkBtn}>Reject</button>
          <button disabled={busy} onClick={() => setRejecting(false)} className={lightBtn}>Cancel</button>
        </div>
      )}
    </article>
  );
}
