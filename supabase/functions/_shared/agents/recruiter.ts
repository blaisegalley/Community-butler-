/*
 * A4 Recruiter: keeps enough Butlers, per town and per service, for the
 * work coming in — and says so when there are more Butlers than work.
 *
 * It looks at the whole roster and job list rather than one record, so it
 * plans its own tasks: one card per finding, each keyed by week so the
 * same shortage doesn't produce a new card every five minutes. When a
 * card's turn comes, the finding is recomputed; if the shortage has gone
 * away in the meantime, the card is closed instead of shown.
 */
import type { AgentConfig, Season } from './config.ts';
import type { AgentContext } from './llm.ts';
import { prefMatches } from './matchmaker.ts';
import { coarseArea, daysBetween, dayKey, isAdjacent, isoWeek, normalizeService } from './rules.ts';
import type { AgentButler, AgentJob, Draft, NewTask, SafetyResult } from './types.ts';
import { draftRequest, refine } from './voice.ts';

const NO_RISK: SafetyResult = { tier: 'Green', reasons: [], conditions: { pairRequired: false, minGrade: '', daylightOnly: true }, messageProblems: [] };
const DAY = 86400000;

export interface SupplyCell {
  town: string;
  service: string;
  /** Butlers who could take this kind of job in this town right now. */
  supply: number;
  /** Open jobs plus the jobs we expect this week. */
  demand: number;
  ratio: number;
}

/** The season this service is about to enter, if today falls in its run-up. */
export function upcomingSeason(service: string, config: AgentConfig, now: Date): { season: Season; start: Date } | null {
  for (const season of config.recruiting.seasons) {
    if (season.service !== service) continue;
    for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
      const start = new Date(Date.UTC(year, season.startMonth - 1, season.startDay));
      const until = +start - +now;
      if (until > 0 && until <= season.leadWeeks * 7 * DAY) return { season, start };
    }
  }
  return null;
}

function canServe(butler: AgentButler, town: string, service: string, config: AgentConfig): boolean {
  if (!butler.approved || butler.stats.openJobs > config.matching.overloadOpenJobs) return false;
  if (butler.jobTypePrefs.length && !prefMatches(butler.jobTypePrefs, service)) return false;
  const home = coarseArea(butler.serviceArea, config) || butler.serviceArea.trim();
  return !home || home.toLowerCase() === town.toLowerCase() || isAdjacent(town, home, config);
}

/**
 * Supply vs demand for every (active town, service) that has any work.
 * Demand = open jobs + half of the last two weeks' requests (a week's
 * worth), times 1.5 in the run-up to that service's season.
 */
export function supplyTable(jobs: AgentJob[], butlers: AgentButler[], config: AgentConfig, now: Date): SupplyCell[] {
  const active = new Set(config.serviceAreas.filter((a) => a.active).map((a) => a.town));
  const demand = new Map<string, number>();
  for (const job of jobs) {
    const town = coarseArea(job.address, config);
    if (!active.has(town)) continue;
    const key = `${town}|${normalizeService(job.service, job.details)}`;
    const open = job.status === 'New' || (job.status === 'Approved' && !job.assignedButlerId);
    const recent = job.status !== 'Rejected' && daysBetween(job.submittedAt, now) <= 14;
    demand.set(key, (demand.get(key) ?? 0) + (open ? 1 : 0) + (recent ? 0.5 : 0));
  }
  const cells: SupplyCell[] = [];
  for (const [key, base] of demand) {
    const [town, service] = key.split('|');
    const expected = upcomingSeason(service, config, now) ? base * 1.5 : base;
    if (expected < 1) continue;
    const supply = butlers.filter((b) => canServe(b, town, service, config)).length;
    cells.push({ town, service, supply, demand: Math.round(expected * 10) / 10, ratio: Math.round((supply / expected) * 100) / 100 });
  }
  return cells.sort((a, b) => a.ratio - b.ratio);
}

/** Towns with plenty of Butlers and little work: time to post on Nextdoor there. */
export function surplusTowns(jobs: AgentJob[], butlers: AgentButler[], config: AgentConfig, now: Date): { town: string; supply: number; demand: number }[] {
  const out: { town: string; supply: number; demand: number }[] = [];
  const cells = supplyTable(jobs, butlers, config, now);
  for (const area of config.serviceAreas.filter((a) => a.active)) {
    const supply = butlers.filter((b) => b.approved && (coarseArea(b.serviceArea, config) || b.serviceArea.trim()).toLowerCase() === area.town.toLowerCase()).length;
    const demand = cells.filter((c) => c.town === area.town).reduce((sum, c) => sum + c.demand, 0);
    if (supply >= 2 && supply / Math.max(demand, 0.5) > config.recruiting.surplusRatio) out.push({ town: area.town, supply, demand });
  }
  return out;
}

function lastAssigned(butlerId: string, jobs: AgentJob[]): string | null {
  return jobs.filter((j) => j.assignedButlerId === butlerId && j.assignedAt).map((j) => j.assignedAt as string).sort().pop() ?? null;
}

export function funnel(jobs: AgentJob[], butlers: AgentButler[], config: AgentConfig, now: Date) {
  const r = config.recruiting;
  return {
    unfinished: butlers.filter((b) => b.profileStatus === 'Draft' && daysBetween(b.signedUpAt, now) >= r.nudgeAfterDays),
    waitingReview: butlers.filter((b) => b.profileStatus === 'Pending' && daysBetween(b.signedUpAt, now) * 24 >= r.pendingReviewHours),
    inactive: butlers.filter((b) => {
      if (!b.approved || b.profileStatus === 'Draft' || daysBetween(b.signedUpAt, now) < r.inactiveDays) return false;
      const last = lastAssigned(b.id, jobs);
      return !last || daysBetween(last, now) >= r.inactiveDays;
    }),
  };
}

/** Which recruiting cards should exist this week. */
export function planRecruiting(
  jobs: AgentJob[],
  butlers: AgentButler[],
  index: Map<string, unknown>,
  config: AgentConfig,
  now: Date,
): NewTask[] {
  const week = isoWeek(now);
  const out: NewTask[] = [];
  const add = (key: string, subjectId: string, priority: number) => {
    if (!index.has(key)) out.push({ type: 'SUPPLY_CHECK', subjectType: 'system', subjectId, idempotencyKey: key, priority });
  };

  for (const cell of supplyTable(jobs, butlers, config, now)) {
    if (cell.ratio < config.recruiting.gapRatio) {
      add(`recruit:gap:${cell.town}:${cell.service}:${week}`, `gap|${cell.town}|${cell.service}`, cell.ratio < config.recruiting.urgentRatio ? 3 : 2);
    }
  }
  for (const surplus of surplusTowns(jobs, butlers, config, now)) add(`recruit:surplus:${surplus.town}:${week}`, `surplus|${surplus.town}`, 1);
  for (const season of config.recruiting.seasons) {
    const upcoming = upcomingSeason(season.service, config, now);
    if (upcoming) add(`recruit:season:${season.service}:${upcoming.start.getUTCFullYear()}`, `season|${season.service}`, 2);
  }
  const f = funnel(jobs, butlers, config, now);
  if (f.unfinished.length) add(`recruit:nudge:${week}`, 'nudge', 1);
  if (f.waitingReview.length) add(`recruit:pending:${dayKey(now)}`, 'pending', 2);
  if (f.inactive.length) add(`recruit:inactive:${week}`, 'inactive', 1);
  return out;
}

function base(agentTitle: string, summary: string, facts: [string, string][]): Pick<Draft, 'agent' | 'title' | 'summary' | 'variants' | 'safety' | 'voice' | 'revisions' | 'facts'> {
  return { agent: 'recruiter', title: agentTitle, summary, variants: [], safety: NO_RISK, voice: null, revisions: 0, facts };
}

export async function runRecruiter(
  subjectId: string,
  jobs: AgentJob[],
  butlers: AgentButler[],
  ctx: AgentContext,
  config: AgentConfig,
  now: Date,
): Promise<{ draft: Draft; priority: number } | { close: string }> {
  const [kind, a, b] = subjectId.split('|');
  const signup = `${config.siteUrl.replace(/\/$/, '')}/auth/`;

  if (kind === 'gap') {
    const cell = supplyTable(jobs, butlers, config, now).find((c) => c.town === a && c.service === b);
    if (!cell || cell.ratio >= config.recruiting.gapRatio) return { close: `No longer short on ${b.toLowerCase()} in ${a}` };
    const facts = `Town: ${a}\nService: ${b}\nButlers who can take it: ${cell.supply}\nJobs open or expected this week: ${cell.demand}\nSign-up link: ${signup}`;
    const variants: string[] = [];
    let first: Awaited<ReturnType<typeof refine>> | null = null;
    for (const angle of ['ask current Butlers to pick up more of this work this week', 'ask Butlers to bring a friend from school who wants paid work']) {
      const result = await refine({
        ctx, config, agent: 'recruiter', channel: 'groupme', facts,
        draftWithModel: draftRequest(ctx, config, 'recruiter', 'GroupMe recruiting post', `Write a GroupMe post (at most 3 short lines) to the student Butler group. Goal: ${angle}. Mention the town and the kind of work. Include the sign-up link only when asking for friends.`, facts),
        template: () =>
          variants.length === 0
            ? `We're short on ${b.toLowerCase()} help in ${a} this week (${Math.ceil(cell.demand)} jobs and only ${cell.supply} of us free).\nIf you can take one, check the app and claim it.`
            : `Know someone at ${config.schoolShortName} who wants paid ${b.toLowerCase()} work in ${a}?\nSend them ${signup} and tell them to finish their profile.`,
      });
      first = first ?? result;
      variants.push(result.text);
    }
    return {
      priority: cell.ratio < config.recruiting.urgentRatio ? 3 : 2,
      draft: {
        ...base(`Short on ${b} help in ${a}`, `${cell.supply} Butler${cell.supply === 1 ? '' : 's'} can take ${b.toLowerCase()} jobs in ${a}, against about ${cell.demand} jobs open or expected this week (ratio ${cell.ratio}, target ${config.recruiting.gapRatio}). Pick a post for the Butler GroupMe.`, [
          ['Town', a], ['Service', b], ['Butlers free', String(cell.supply)], ['Jobs expected', String(cell.demand)], ['Ratio', String(cell.ratio)],
        ]),
        text: variants[0],
        variants,
        channel: 'groupme',
        action: { kind: 'post_groupme' },
        voice: first?.voice ?? null,
        confidence: 0.85,
        source: first?.source ?? 'template',
        revisions: first?.revisions ?? 0,
        flags: [...(first?.flags ?? []), 'supply_gap'],
        safety: { ...NO_RISK, messageProblems: first?.problems ?? [] },
      },
    };
  }

  if (kind === 'surplus') {
    const surplus = surplusTowns(jobs, butlers, config, now).find((s) => s.town === a);
    if (!surplus) return { close: `${a} no longer has spare Butlers` };
    const facts = `Town: ${a}\nWho is posting: high school students from ${config.schoolShortName}\nServices: yard work, leaf raking, snow shoveling, moving help, junk hauling, dog walking, odd jobs\nHow to book: the request form at ${config.siteUrl}/request/`;
    const result = await refine({
      ctx, config, agent: 'recruiter', channel: 'nextdoor', facts,
      draftWithModel: draftRequest(ctx, config, 'recruiter', 'Nextdoor post', `Write a short Nextdoor post (not a reply) for ${a} neighbors, in the voice of a few high school students offering help this week. 40-90 words. Mention one or two seasonal jobs. End with how to book.`, facts),
      template: () =>
        `Hi ${a} neighbors! A few of us at ${config.schoolShortName} have time this week for yard work, raking, hauling, dog walking and other odd jobs. If you could use a hand, you can book us at ${config.siteUrl}/request/ and one of us will reach out.`,
    });
    return {
      priority: 1,
      draft: {
        ...base(`More Butlers than work in ${a}`, `${surplus.supply} Butlers are based in ${a} but only about ${surplus.demand} jobs are open or expected. A Nextdoor post there should bring in work. Post it from your own account, then tap I posted it.`, [
          ['Town', a], ['Butlers', String(surplus.supply)], ['Jobs expected', String(surplus.demand)],
        ]),
        text: result.text,
        channel: 'nextdoor',
        action: { kind: 'manual_post', where: `Nextdoor (${a})` },
        voice: result.voice,
        confidence: 0.75,
        source: result.source,
        revisions: result.revisions,
        flags: result.flags,
        safety: { ...NO_RISK, messageProblems: result.problems },
      },
    };
  }

  if (kind === 'season') {
    const upcoming = upcomingSeason(a, config, now);
    if (!upcoming) return { close: `Not in the run-up to ${a.toLowerCase()} season any more` };
    const weeks = Math.round((+upcoming.start - +now) / (7 * DAY));
    const willing = butlers.filter((x) => x.approved && (!x.jobTypePrefs.length || prefMatches(x.jobTypePrefs, a))).length;
    const facts = `Season: ${upcoming.season.label} (${a.toLowerCase()})\nStarts in about ${weeks} weeks\nButlers who list this work today: ${willing}\nSign-up link: ${signup}`;
    const result = await refine({
      ctx, config, agent: 'recruiter', channel: 'groupme', facts,
      draftWithModel: draftRequest(ctx, config, 'recruiter', 'season recruiting post', `Write a GroupMe post (at most 3 short lines) getting the student group ready for ${upcoming.season.label}: ask who wants ${a.toLowerCase()} jobs, and to bring friends. Include the sign-up link.`, facts),
      template: () =>
        `${upcoming.season.label[0].toUpperCase()}${upcoming.season.label.slice(1)} starts in about ${weeks} weeks and ${a.toLowerCase()} requests pick up fast.\nAdd ${a} to your job types in the app if you want in, and send friends to ${signup}`,
    });
    return {
      priority: 2,
      draft: {
        ...base(`Get ready for ${upcoming.season.label}`, `${upcoming.season.label[0].toUpperCase()}${upcoming.season.label.slice(1)} starts in about ${weeks} weeks. ${willing} Butler${willing === 1 ? ' lists' : 's list'} ${a.toLowerCase()} today. Recruiting now beats scrambling the week it starts.`, [
          ['Season', upcoming.season.label], ['Starts', upcoming.start.toISOString().slice(0, 10)], ['Butlers ready', String(willing)],
        ]),
        text: result.text,
        channel: 'groupme',
        action: { kind: 'post_groupme' },
        voice: result.voice,
        confidence: 0.8,
        source: result.source,
        revisions: result.revisions,
        flags: result.flags,
        safety: { ...NO_RISK, messageProblems: result.problems },
      },
    };
  }

  const f = funnel(jobs, butlers, config, now);
  if (kind === 'nudge') {
    if (!f.unfinished.length) return { close: 'Everyone has finished their profile' };
    return {
      priority: 1,
      draft: {
        ...base(`Nudge ${f.unfinished.length} Butler${f.unfinished.length > 1 ? 's' : ''} to finish their profile`, `Signed up ${config.recruiting.nudgeAfterDays}+ days ago and never submitted a profile, so neighbors can't see them and they can't be matched.`, [
          ['Butlers', f.unfinished.map((x) => x.name).join(', ')],
        ]),
        text: `Hey! Your ${config.businessName} profile isn't finished yet. Add a photo and a few answers in the app so neighbors can see you and you can start getting jobs.`,
        channel: 'butler_app',
        action: { kind: 'notify_butlers', butlerIds: f.unfinished.map((x) => x.id) },
        confidence: 0.9,
        source: 'template',
        flags: [],
      },
    };
  }
  if (kind === 'pending') {
    if (!f.waitingReview.length) return { close: 'No profiles are waiting any more' };
    return {
      priority: 2,
      draft: {
        ...base(`${f.waitingReview.length} profile${f.waitingReview.length > 1 ? 's' : ''} waiting on review`, `These Butlers submitted a profile more than ${config.recruiting.pendingReviewHours} hours ago and can't be matched until one of you reviews it in Profiles to review.`, [
          ['Butlers', f.waitingReview.map((x) => x.name).join(', ')],
        ]),
        text: `Profiles waiting: ${f.waitingReview.map((x) => x.name).join(', ')}. Open the Profiles to review tab.`,
        channel: 'internal',
        action: { kind: 'acknowledge' },
        confidence: 1,
        source: 'template',
        flags: [],
      },
    };
  }
  if (kind === 'inactive') {
    if (!f.inactive.length) return { close: 'Nobody has been inactive that long' };
    return {
      priority: 1,
      draft: {
        ...base(`Check in with ${f.inactive.length} quiet Butler${f.inactive.length > 1 ? 's' : ''}`, `No job in ${config.recruiting.inactiveDays}+ days. A friendly check-in keeps them on the roster for the next busy season.`, [
          ['Butlers', f.inactive.map((x) => x.name).join(', ')],
        ]),
        text: `Hey! It's been a little while. There are new jobs in the app if you want some work this week. If you're busy right now, no worries, just let us know.`,
        channel: 'butler_app',
        action: { kind: 'notify_butlers', butlerIds: f.inactive.map((x) => x.id) },
        confidence: 0.85,
        source: 'template',
        flags: [],
      },
    };
  }
  return { close: `Unknown recruiting finding: ${subjectId}` };
}
