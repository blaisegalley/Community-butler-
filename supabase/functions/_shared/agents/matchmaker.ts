/*
 * A3 Matchmaker: for an approved job, rank Butlers and draft either a
 * direct assignment or a GroupMe "job available" post.
 *
 * Ranking is plain arithmetic with weights from config, so an admin can
 * see exactly why someone came first. The model is only used to word the
 * GroupMe post.
 */
import type { AgentConfig } from './config.ts';
import type { AgentContext } from './llm.ts';
import { coarseArea, isAdjacent, meetsGrade, normEmail, normPhone, normalizeService, priceGuidance } from './rules.ts';
import type { AgentButler, AgentJob, Draft, SafetyResult } from './types.ts';
import { draftRequest, refine } from './voice.ts';

export interface RankedButler {
  butler: AgentButler;
  score: number;
  why: string[];
}

/** Whether a Butler's listed job types cover this service ("Cleanouts" matches "Cleanout"). */
export function prefMatches(prefs: string[], service: string): boolean {
  const target = service.toLowerCase().replace(/s$/, '');
  return prefs.some((p) => {
    const pref = p.toLowerCase().replace(/s$/, '');
    return pref === target || (pref === 'odd job' && target === 'odd job');
  });
}

/** Bayesian-smoothed rating, so one 5-star job does not outrank twenty 4.8s. */
function reliability(stats: AgentButler['stats']): number {
  const ratingSum = stats.ratings.reduce((a, b) => a + b, 0);
  const rating = (ratingSum + 4 * 2) / (stats.ratings.length + 2) / 5;
  const completion = (stats.completed + 1) / (stats.assigned + 1);
  return Math.min(1, 0.6 * rating + 0.4 * completion);
}

export function rankButlers(
  job: AgentJob,
  butlers: AgentButler[],
  safety: SafetyResult,
  config: AgentConfig,
  options: { widen?: boolean } = {},
): { ranked: RankedButler[]; excluded: { butler: AgentButler; reason: string }[] } {
  const service = normalizeService(job.service, job.details);
  const town = coarseArea(job.address, config);
  const w = config.matching.weights;
  const excluded: { butler: AgentButler; reason: string }[] = [];
  const ranked: RankedButler[] = [];
  const phone = normPhone(job.phone);
  const email = normEmail(job.email);

  for (const butler of butlers) {
    if (!butler.approved) { excluded.push({ butler, reason: 'Profile not approved yet' }); continue; }
    if (!meetsGrade(butler.grade, safety.conditions.minGrade)) {
      excluded.push({ butler, reason: `Needs ${safety.conditions.minGrade} or older${butler.grade ? '' : ' (grade unknown)'}` });
      continue;
    }
    const why: string[] = [];
    const serviceScore = prefMatches(butler.jobTypePrefs, service) ? 1 : butler.jobTypePrefs.length ? 0.2 : 0.5;
    if (serviceScore === 1) why.push(`does ${service.toLowerCase()}`);
    if (!options.widen && serviceScore < 1 && butler.jobTypePrefs.length) {
      excluded.push({ butler, reason: `Doesn't list ${service.toLowerCase()}` });
      continue;
    }

    const home = coarseArea(butler.serviceArea, config) || butler.serviceArea.trim();
    let proximity = 0.3;
    if (town && home && home.toLowerCase() === town.toLowerCase()) { proximity = 1; why.push(`works in ${town}`); }
    else if (town && home && isAdjacent(town, home, config)) { proximity = 0.6; why.push(`works next door in ${home}`); }
    else if (town && home) proximity = options.widen ? 0.3 : 0.1;

    const rel = reliability(butler.stats);
    if (butler.stats.ratings.length) why.push(`${(butler.stats.ratings.reduce((a, b) => a + b, 0) / butler.stats.ratings.length).toFixed(1)}★ over ${butler.stats.ratings.length} jobs`);
    const fairness = 1 - Math.min(butler.stats.jobsLast14Days, 5) / 5;
    if (butler.stats.jobsLast14Days === 0) why.push('no jobs in the last 2 weeks');
    const affinity = (phone && butler.stats.happyCustomers.includes(phone)) || (email && butler.stats.happyCustomers.includes(email)) ? 1 : 0;
    if (affinity) why.push('this neighbor rated them 4★+ before');

    let score = w.service * serviceScore + w.proximity * proximity + w.reliability * rel + w.fairness * fairness + w.affinity * affinity;
    if (butler.stats.openJobs > config.matching.overloadOpenJobs) { score -= 0.2; why.push(`already has ${butler.stats.openJobs} open jobs`); }
    ranked.push({ butler, score: Math.round(score * 100) / 100, why });
  }
  ranked.sort((a, b) => b.score - a.score);
  return { ranked, excluded };
}

export interface MatchResult {
  draft: Draft;
  priority: number;
}

export async function runMatch(
  job: AgentJob,
  butlers: AgentButler[],
  safety: SafetyResult,
  ctx: AgentContext,
  config: AgentConfig,
  options: { escalation?: number } = {},
): Promise<MatchResult> {
  const escalation = options.escalation ?? 0;
  const service = normalizeService(job.service, job.details);
  const town = coarseArea(job.address, config);
  const guidance = priceGuidance(service, job.budget, config);
  const pay = guidance.stated !== null ? guidance.stated : guidance.low;
  const bump = escalation > 0 ? 5 : 0;
  const { ranked, excluded } = rankButlers(job, butlers, safety, config, { widen: escalation > 0 });
  const [top, second] = ranked;
  const pair = safety.conditions.pairRequired;

  const facts: [string, string][] = [
    ['Service', service],
    ['Town', town || 'Unknown'],
    ['Date', job.date || 'Flexible'],
    ['Pay', `$${pay + bump}${bump ? ` (includes a $${bump} bump)` : ''}`],
    ['Shortlist', ranked.slice(0, 3).map((r) => `${r.butler.name} (${r.score})`).join(', ') || 'Nobody eligible'],
  ];
  if (excluded.length) facts.push(['Left out', excluded.slice(0, 3).map((e) => `${e.butler.name}: ${e.reason}`).join('; ')]);

  const canAssign =
    escalation === 0 &&
    top &&
    top.score >= config.matching.assignThreshold &&
    (!second || top.score - second.score >= config.matching.assignMargin || pair) &&
    (!pair || (second && second.score >= config.matching.pairThreshold));

  if (canAssign) {
    const team = pair ? [top, second] : [top];
    const names = team.map((t) => t.butler.name.split(' ')[0]).join(' and ');
    const text = `Hey ${names}! You've got a ${service.toLowerCase()} job${town ? ` in ${town}` : ''}${job.date ? ` on ${job.date}` : ''}. Open the app for the address and details.${pair ? ' You two are working this one together.' : ''}`;
    return {
      priority: 2,
      draft: {
        agent: 'matchmaker',
        title: `Assign ${names} to ${service} for ${job.name}`,
        summary: `${team.map((t) => `${t.butler.name}: ${t.why.join(', ') || 'best available'}`).join('. ')}.${pair ? ' This job needs two Butlers.' : ''}`,
        text,
        variants: [],
        channel: 'butler_app',
        action: { kind: 'assign_butler', jobId: job.id, butlerIds: team.map((t) => t.butler.id) },
        safety,
        voice: null,
        confidence: top.score,
        source: 'template',
        revisions: 0,
        flags: [],
        facts,
      },
    };
  }

  // No clear fit: post it to the group. Town only — never the address or the neighbor's name.
  const conditions = [pair ? 'needs 2 people' : '', safety.conditions.minGrade ? `${safety.conditions.minGrade}s and up` : ''].filter(Boolean).join(', ');
  const factText = `Service: ${service}\nTown: ${town || 'nearby'}\nDate: ${job.date || 'flexible'}\nPay: about $${pay + bump}${conditions ? `\nConditions: ${conditions}` : ''}`;
  const result = await refine({
    ctx, config, agent: 'matchmaker', channel: 'groupme', facts: factText,
    draftWithModel: draftRequest(ctx, config, 'matchmaker', 'GroupMe job post',
      'Write a GroupMe post (at most 3 short lines) to the student group announcing an open job. Include service, town, date, pay and conditions. End with: claim it in the app. Never include an address, street, or the customer\'s name.',
      factText),
    template: () =>
      `${escalation > 0 ? 'Still open: ' : 'New job: '}${service.toLowerCase()} in ${town || 'town'}${job.date ? `, ${job.date}` : ''}. About $${pay + bump}${bump ? ` (bumped)` : ''}${conditions ? `, ${conditions}` : ''}.\nClaim it in the app.`,
  });
  const reason = !top
    ? 'Nobody on the roster is eligible for this one'
    : escalation > 0
      ? `Unclaimed after ${escalation === 1 ? config.escalation.firstHours : config.escalation.secondHours}h — widening to nearby towns with a $${bump} bump`
      : pair && !(second && second.score >= config.matching.pairThreshold)
        ? 'Needs two Butlers and there aren\'t two strong fits'
        : `No clear best fit (top score ${top.score})`;

  return {
    priority: escalation > 0 ? 3 : 2,
    draft: {
      agent: 'matchmaker',
      title: `${escalation > 0 ? 'Re-post' : 'Post'} ${service} to GroupMe`,
      summary: `${reason}. The post names the town only; the address stays in the app for whoever claims it.`,
      text: result.text,
      variants: [],
      channel: 'groupme',
      action: { kind: 'post_groupme', jobId: job.id },
      safety: { ...safety, messageProblems: result.problems },
      voice: result.voice,
      confidence: top ? Math.min(0.9, top.score) : 0.5,
      source: result.source,
      revisions: result.revisions,
      flags: [...result.flags, ...(escalation > 1 ? ['supply_gap'] : [])],
      facts,
    },
  };
}
