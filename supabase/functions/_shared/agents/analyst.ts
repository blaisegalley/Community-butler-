/*
 * A9 Analyst: the weekly look back, and the outer feedback loop.
 *
 * Once a week (the first run after Monday 7am Chicago) it writes a digest
 * card from the jobs, leads, agent decisions and spend, and turns a few
 * clear patterns into proposals: serve a town people keep asking for,
 * review an agent whose drafts keep getting rewritten, loosen matching
 * when jobs keep going unclaimed, raise the budget before it runs out.
 * Every proposal is its own card. Approving one writes a new
 * agent_config version, which can be rolled back.
 */
import type { AgentConfig } from './config.ts';
import type { AgentContext } from './llm.ts';
import { askModel, isObject, UNTRUSTED_RULE } from './llm.ts';
import { coarseArea, daysBetween, isoWeek } from './rules.ts';
import type { AgentId, AgentJob, AgentRun, AgentTask, Draft, Lead, NewTask, SafetyResult } from './types.ts';

const NO_RISK: SafetyResult = { tier: 'Green', reasons: [], conditions: { pairRequired: false, minGrade: '', daylightOnly: true }, messageProblems: [] };

export const AGENT_NAMES: Record<AgentId, string> = {
  dispatcher: 'Dispatcher', intake: 'Intake', safety: 'Safety', matchmaker: 'Matchmaker', lead_scout: 'Lead Scout',
  voice: 'Voice Editor', care: 'Care', recruiter: 'Recruiter', b2b: 'B2B outreach', web_studio: 'Web Studio', analyst: 'Analyst',
};

export interface AnalystInput {
  jobs: AgentJob[];
  tasks: AgentTask[];
  runs: AgentRun[];
  leads: Lead[];
}

function within(iso: string | null | undefined, days: number, now: Date): boolean {
  return Boolean(iso) && daysBetween(iso as string, now) <= days && daysBetween(iso as string, now) >= 0;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Towns people asked for that we don't serve, from waitlist notes in the last 30 days. */
export function waitlistDemand(jobs: AgentJob[], now: Date): Map<string, number> {
  const out = new Map<string, number>();
  for (const job of jobs) {
    const match = job.rejectNote?.match(/Outside our service area \(([^)]+)\)/);
    if (match && within(job.submittedAt, 30, now)) out.set(match[1], (out.get(match[1]) ?? 0) + 1);
  }
  return out;
}

/** How often each agent's cards were approved untouched, over the last `days`. */
export function approvalRates(tasks: AgentTask[], now: Date, days: number) {
  const byAgent = new Map<AgentId, { asIs: number; edited: number; rejected: number; reasons: Map<string, number> }>();
  for (const task of tasks) {
    if (!task.draft) continue;
    for (const d of task.decisions) {
      if (!within(d.at, days, now) || !['approve', 'edit', 'reject'].includes(d.decision)) continue;
      const entry = byAgent.get(task.draft.agent) ?? { asIs: 0, edited: 0, rejected: 0, reasons: new Map() };
      if (d.decision === 'approve') entry.asIs++;
      else if (d.decision === 'edit') entry.edited++;
      else {
        entry.rejected++;
        entry.reasons.set(d.reason, (entry.reasons.get(d.reason) ?? 0) + 1);
      }
      byAgent.set(task.draft.agent, entry);
    }
  }
  return [...byAgent.entries()].map(([agent, e]) => {
    const total = e.asIs + e.edited + e.rejected;
    return { agent, total, asIs: e.asIs, edited: e.edited, rejected: e.rejected, rate: total ? e.asIs / total : 1, reasons: e.reasons };
  });
}

export function monthSpend(runs: AgentRun[], now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return runs.filter((r) => r.mode === 'model' && +new Date(r.at) >= start).reduce((sum, r) => sum + r.costUsd, 0);
}

export interface Proposal {
  /** Stable within a week: "activate-town|Palatine". */
  id: string;
  title: string;
  summary: string;
  facts: [string, string][];
  /** Null means "look at this", not a config change. */
  patch: Record<string, unknown> | null;
  priority: number;
}

export function findProposals(input: AnalystInput, config: AgentConfig, now: Date): Proposal[] {
  const out: Proposal[] = [];
  const a = config.analyst;

  for (const [town, count] of waitlistDemand(input.jobs, now)) {
    const area = config.serviceAreas.find((s) => s.town === town);
    if (!area || area.active || count < a.expansionThreshold) continue;
    out.push({
      id: `activate-town|${town}`,
      title: `Start serving ${town}?`,
      summary: `${count} requests from ${town} were waitlisted in the last 30 days. Approving adds ${town} to the towns the agents accept jobs from. Make sure a few Butlers can get there first.`,
      facts: [['Town', town], ['Waitlisted (30 days)', String(count)], ['Next to', area.adjacent.join(', ') || '—']],
      patch: { serviceAreas: config.serviceAreas.map((s) => (s.town === town ? { ...s, active: true } : s)) },
      priority: 2,
    });
  }

  for (const r of approvalRates(input.tasks, now, 14)) {
    if (r.total < a.minSample || r.rate >= a.lowApprovalRate) continue;
    const reasons = [...r.reasons.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k.replace('_', ' ')} ×${v}`).join(', ');
    out.push({
      id: `agent-review|${r.agent}`,
      title: `${AGENT_NAMES[r.agent]} drafts need work`,
      summary: `Only ${Math.round(r.rate * 100)}% of ${AGENT_NAMES[r.agent]} cards were approved without changes in the last 2 weeks (${r.edited} edited, ${r.rejected} rejected${reasons ? `: ${reasons}` : ''}). Your edits are already fed back as examples; if this doesn't improve next week, its prompt or template needs a rewrite.`,
      facts: [['Agent', AGENT_NAMES[r.agent]], ['Approved as-is', `${r.asIs} of ${r.total}`], ['Edited', String(r.edited)], ['Rejected', String(r.rejected)]],
      patch: null,
      priority: 1,
    });
  }

  const escalations = input.tasks.filter((t) => t.type === 'MATCH_ESCALATE' && within(t.createdAt, 14, now)).length;
  if (escalations >= a.escalationsBeforeTuning && config.matching.assignThreshold > 0.6) {
    const next = Math.round((config.matching.assignThreshold - 0.05) * 100) / 100;
    out.push({
      id: `match-threshold|${next}`,
      title: `Assign more jobs directly?`,
      summary: `${escalations} jobs sat unclaimed long enough to be re-posted in the last 2 weeks. Lowering the bar for a direct assignment from ${config.matching.assignThreshold} to ${next} means the Matchmaker proposes a specific Butler more often instead of a GroupMe post.`,
      facts: [['Escalations (14 days)', String(escalations)], ['Threshold now', String(config.matching.assignThreshold)], ['Proposed', String(next)]],
      patch: { matching: { ...config.matching, assignThreshold: next } },
      priority: 1,
    });
  }

  const spend = monthSpend(input.runs, now);
  const dayOfMonth = now.getUTCDate();
  if (spend >= config.monthlyBudgetUsd * 0.8 && dayOfMonth <= 20) {
    const next = Math.ceil(config.monthlyBudgetUsd * 1.5);
    out.push({
      id: `budget|${next}`,
      title: `AI budget will run out early`,
      summary: `$${spend.toFixed(2)} of the $${config.monthlyBudgetUsd} monthly budget is already spent by day ${dayOfMonth}. When it runs out the agents switch to plain templates until the 1st. Approve to raise it to $${next}, or reject to keep it.`,
      facts: [['Spent this month', `$${spend.toFixed(2)}`], ['Budget', `$${config.monthlyBudgetUsd}`], ['Proposed', `$${next}`]],
      patch: { monthlyBudgetUsd: next },
      priority: 2,
    });
  }
  return out;
}

/** True once this week's review is due: the first run on or after Monday at reviewHourUtc. */
export function reviewDue(index: Map<string, unknown>, config: AgentConfig, now: Date): boolean {
  if (index.has(`review:${isoWeek(now)}`)) return false;
  return now.getUTCDay() !== 1 || now.getUTCHours() >= config.analyst.reviewHourUtc;
}

export function planAnalyst(input: AnalystInput, index: Map<string, unknown>, config: AgentConfig, now: Date): NewTask[] {
  if (!reviewDue(index, config, now)) return [];
  const week = isoWeek(now);
  const tasks: NewTask[] = [{ type: 'WEEKLY_REVIEW', subjectType: 'system', subjectId: `review|${week}`, idempotencyKey: `review:${week}`, priority: 2 }];
  for (const p of findProposals(input, config, now)) {
    const key = `proposal:${week}:${p.id}`;
    if (!index.has(key)) tasks.push({ type: 'CONFIG_PROPOSAL', subjectType: 'system', subjectId: p.id, idempotencyKey: key, priority: p.priority });
  }
  return tasks;
}

export function weeklyDigest(input: AnalystInput, config: AgentConfig, now: Date): { text: string; facts: [string, string][]; numbers: Record<string, unknown> } {
  const { jobs, tasks, runs, leads } = input;
  const thisWeek = jobs.filter((j) => within(j.submittedAt, 7, now));
  const lastWeek = jobs.filter((j) => daysBetween(j.submittedAt, now) > 7 && daysBetween(j.submittedAt, now) <= 14);
  const completed = jobs.filter((j) => j.status === 'Completed' && within(j.completedAt, 7, now));
  const rated = completed.filter((j) => typeof j.rating === 'number');
  const avgRating = rated.length ? rated.reduce((s, j) => s + (j.rating ?? 0), 0) / rated.length : null;
  const toAssigned = median(jobs.filter((j) => j.assignedAt && within(j.assignedAt, 7, now)).map((j) => daysBetween(j.submittedAt, new Date(j.assignedAt as string)) * 24));

  const towns = new Map<string, number>();
  for (const j of thisWeek) {
    const t = coarseArea(j.address, config) || 'Unknown';
    towns.set(t, (towns.get(t) ?? 0) + 1);
  }
  const townLine = [...towns.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([t, n]) => `${t} ${n}`).join(', ') || '—';

  const newLeads = leads.filter((l) => within(l.createdAt, 7, now));
  const posts = newLeads.filter((l) => !['b2b', 'web'].includes(l.channel));
  const replied = posts.filter((l) => l.status === 'replied').length;
  const b2b = leads.filter((l) => l.channel === 'b2b');
  const web = leads.filter((l) => l.channel === 'web');

  const rates = approvalRates(tasks, now, 7);
  const decided = rates.reduce((s, r) => s + r.total, 0);
  const asIs = rates.reduce((s, r) => s + r.asIs, 0);
  const edited = rates.reduce((s, r) => s + r.edited, 0);
  const rejected = rates.reduce((s, r) => s + r.rejected, 0);
  const expired = tasks.filter((t) => t.state === 'expired' && within(t.updatedAt, 7, now)).length;
  const weakest = rates.filter((r) => r.total >= 3).sort((x, y) => x.rate - y.rate)[0];
  const spend = monthSpend(runs, now);
  const waitlist = [...waitlistDemand(jobs, now).entries()].sort((x, y) => y[1] - x[1]).map(([t, n]) => `${t} ${n}`).join(', ') || 'none';
  const gaps = tasks.filter((t) => t.type === 'SUPPLY_CHECK' && t.subjectId.startsWith('gap|') && within(t.createdAt, 7, now)).map((t) => t.subjectId.split('|').slice(1).join(' / '));

  const text = [
    `WEEK OF ${now.toISOString().slice(0, 10)}`,
    '',
    `Requests: ${thisWeek.length} new (${lastWeek.length} the week before). Completed: ${completed.length}.${avgRating !== null ? ` Average rating ${avgRating.toFixed(1)}★ from ${rated.length}.` : ''}`,
    `Speed: ${toAssigned !== null ? `median ${toAssigned < 24 ? `${Math.round(toAssigned)}h` : `${(toAssigned / 24).toFixed(1)} days`} from request to a Butler assigned` : 'no assignments this week'}.`,
    `By town: ${townLine}.`,
    `Waitlisted towns (30 days): ${waitlist}.`,
    `Short-staffed: ${gaps.length ? gaps.join('; ') : 'nowhere'}.`,
    '',
    `Posts pasted: ${posts.length} (${replied} replied to). Businesses: ${b2b.filter((l) => l.status === 'contacted').length} contacted, ${b2b.filter((l) => l.status === 'replied').length} replied, ${b2b.filter((l) => l.status === 'won').length} won. Website inquiries: ${web.length} total, ${web.filter((l) => l.status === 'won').length} won.`,
    '',
    `Cards decided: ${decided} (${asIs} approved as-is, ${edited} edited, ${rejected} rejected). ${expired} expired unanswered.`,
    weakest ? `Most rewritten: ${AGENT_NAMES[weakest.agent]}, ${Math.round(weakest.rate * 100)}% approved as-is.` : '',
    `AI spend this month: $${spend.toFixed(2)} of $${config.monthlyBudgetUsd}.`,
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');

  return {
    text,
    facts: [
      ['New requests', `${thisWeek.length} (was ${lastWeek.length})`],
      ['Completed', String(completed.length)],
      ['Rating', avgRating !== null ? `${avgRating.toFixed(1)}★` : '—'],
      ['Cards as-is', decided ? `${Math.round((asIs / decided) * 100)}%` : '—'],
      ['AI spend', `$${spend.toFixed(2)}`],
    ],
    numbers: { newRequests: thisWeek.length, lastWeek: lastWeek.length, completed: completed.length, avgRating, medianHoursToAssigned: toAssigned, towns: Object.fromEntries(towns), waitlist, gaps, posts: posts.length, replied, decided, asIs, edited, rejected, expired, spend },
  };
}

export async function runWeeklyReview(input: AnalystInput, ctx: AgentContext, config: AgentConfig, now: Date): Promise<{ draft: Draft; priority: number }> {
  const digest = weeklyDigest(input, config, now);
  const focus = await askModel<{ focus: string }>(
    ctx,
    {
      agent: 'analyst',
      purpose: 'weekly focus',
      effort: 'medium',
      schema: { type: 'object', additionalProperties: false, required: ['focus'], properties: { focus: { type: 'string' } } },
      system: `You help three high-school co-admins of a student-run neighborhood help service decide what to focus on this week. They have about 15 minutes a day. From the numbers, write 2-3 plain sentences: the single most important thing to do this week and why, and one thing that is going well. Use only the numbers given; do not invent any. ${UNTRUSTED_RULE}`,
      prompt: `This week's numbers (JSON):\n${JSON.stringify(digest.numbers)}`,
    },
    (value): value is { focus: string } => isObject(value) && typeof value.focus === 'string' && value.focus.trim().length > 0,
  );
  const proposals = findProposals(input, config, now);
  return {
    priority: 2,
    draft: {
      agent: 'analyst',
      title: `Weekly review: week of ${now.toISOString().slice(0, 10)}`,
      summary: `${focus?.focus.trim() ?? 'Here is how the week went.'}${proposals.length ? ` ${proposals.length} suggested change${proposals.length > 1 ? 's are' : ' is'} in separate cards.` : ''}`,
      text: digest.text,
      variants: [],
      channel: 'internal',
      action: { kind: 'acknowledge' },
      safety: NO_RISK,
      voice: null,
      confidence: 1,
      source: focus ? 'model' : 'template',
      revisions: 0,
      flags: focus ? [] : ['template'],
      facts: digest.facts,
    },
  };
}

export function runProposal(proposalId: string, input: AnalystInput, config: AgentConfig, now: Date): { draft: Draft; priority: number } | { close: string } {
  const proposal = findProposals(input, config, now).find((p) => p.id === proposalId);
  if (!proposal) return { close: 'No longer applies' };
  return {
    priority: proposal.priority,
    draft: {
      agent: 'analyst',
      title: proposal.title,
      summary: proposal.summary,
      text: '',
      variants: [],
      channel: 'none',
      action: proposal.patch ? { kind: 'apply_config', patch: proposal.patch, summary: proposal.title } : { kind: 'acknowledge' },
      safety: NO_RISK,
      voice: null,
      confidence: 0.8,
      source: 'template',
      revisions: 0,
      flags: [],
      facts: proposal.facts,
    },
  };
}
