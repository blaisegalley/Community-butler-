/*
 * A1 Intake + A2 Safety Officer, for a new job request.
 *
 * Produces exactly one approval card per request: approve it (with any
 * safety conditions), ask the neighbour a question, put them on the
 * waitlist, decline it as unsafe, or flag it as a duplicate.
 */
import type { AgentConfig } from './config.ts';
import type { AgentContext } from './llm.ts';
import { askModel, isObject, quoteUntrusted, stringArray, UNTRUSTED_RULE } from './llm.ts';
import { coarseArea, detectTown, findDuplicate, firstName, looksLikeInjection, maxTier, normalizeService, priceGuidance, ruleSafety, words } from './rules.ts';
import type { AgentJob, Draft, SafetyResult, Tier } from './types.ts';
import { draftRequest, refine } from './voice.ts';

export interface IntakeResult {
  draft: Draft;
  priority: number;
}

const ASSESS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'critical_missing', 'tier', 'risk_notes', 'confidence'],
  properties: {
    summary: { type: 'string' },
    critical_missing: { type: 'array', items: { type: 'string' } },
    tier: { type: 'string', enum: ['Green', 'Yellow', 'Red'] },
    risk_notes: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
  },
};

interface Assessment {
  summary: string;
  critical_missing: string[];
  tier: Tier;
  risk_notes: string[];
  confidence: number;
}

function hoursUntil(date: string, now: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return (+new Date(`${date}T12:00:00`) - +now) / 3600000;
}

export async function runIntake(
  job: AgentJob,
  allJobs: AgentJob[],
  ctx: AgentContext,
  config: AgentConfig,
  now: Date,
): Promise<IntakeResult> {
  const service = normalizeService(job.service, job.details);
  const town = detectTown(`${job.address} ${job.details}`, config);
  const area = town?.town ?? coarseArea(job.address, config);
  const guidance = priceGuidance(service, job.budget, config);
  const neighbor = firstName(job.name) || 'there';
  const facts: [string, string][] = [
    ['Service', service],
    ['Town', area || 'Unknown'],
    ['Date', job.date || 'Flexible'],
    ['Budget', guidance.stated !== null ? `$${guidance.stated}` : 'Not given'],
    ['Typical price', `$${guidance.low}–$${guidance.high}`],
  ];
  const factText = facts.map(([k, v]) => `${k}: ${v}`).join('\n');
  const base = { agent: 'intake' as const, variants: [], voice: null, revisions: 0 };

  // 1. Duplicate — no message needed, the neighbour already has a request in.
  const duplicate = findDuplicate(job, allJobs);
  if (duplicate) {
    return {
      priority: 1,
      draft: {
        ...base,
        title: `Possible duplicate: ${service} for ${job.name}`,
        summary: `Same contact asked for ${service.toLowerCase()} on ${duplicate.submittedAt.slice(0, 10)} and that request is still ${duplicate.status}. Approving closes this copy without messaging anyone.`,
        text: '',
        channel: 'none',
        action: { kind: 'decline_job', jobId: job.id, note: 'Duplicate request', notifyNeighbor: false },
        safety: ruleSafety(job, service, config),
        confidence: 0.9,
        source: 'template',
        flags: [],
        facts,
      },
    };
  }

  // 2. Outside the area we serve today — waitlist, and remember the demand.
  if (town && !town.active) {
    const result = await refine({
      ctx, config, agent: 'intake', channel: 'email', facts: factText,
      draftWithModel: draftRequest(ctx, config, 'intake', 'waitlist reply',
        'Write a short, kind email body (no subject, no sign-off name) telling a neighbor we do not cover their town yet, that we are expanding and will reach out when we do. Do not promise a date.',
        `Neighbor first name: ${neighbor}\nTheir town: ${town.town}\nService they asked for: ${service}`),
      template: () =>
        `Hi ${neighbor}, thanks so much for reaching out! We're a group of high schoolers from ${config.schoolShortName} and we don't cover ${town.town} quite yet. We're expanding to nearby towns soon, and we'll let you know as soon as we can help with ${service.toLowerCase()} there.`,
    });
    return {
      priority: 1,
      draft: {
        ...base,
        title: `Outside our area: ${service} in ${town.town}`,
        summary: `${town.town} isn't an active town yet, so this goes on the waitlist. Logged as demand for expanding there.`,
        text: result.text,
        channel: 'email',
        action: { kind: 'decline_job', jobId: job.id, note: `Outside our service area (${town.town}) — waitlisted`, notifyNeighbor: true },
        safety: { ...ruleSafety(job, service, config), messageProblems: result.problems },
        voice: result.voice,
        confidence: 0.9,
        source: result.source,
        revisions: result.revisions,
        flags: [...result.flags, ...(job.email ? [] : ['no_email'])],
        facts,
      },
    };
  }

  // 3. Safety: rules set the floor, the model may only raise it.
  const safety: SafetyResult = ruleSafety(job, service, config);
  if (looksLikeInjection(job.details)) safety.reasons.push('Request text contains instructions aimed at an AI — read it yourself');
  const assessment = await askModel<Assessment>(
    ctx,
    {
      agent: 'safety',
      purpose: 'assess job request',
      effort: 'low',
      schema: ASSESS_SCHEMA,
      system: `You help the admins of a student-run odd-jobs service (high-school students, ages 14-18, working at neighbors' homes in the Chicago suburbs) review a job request.
Return:
- summary: one plain sentence describing the job.
- critical_missing: only information without which a student could not show up and do the job (not nice-to-haves). Usually empty.
- tier: Green (normal outdoor daylight work), Yellow (inside a home, heavy lifting, power tools, vulnerable customer, long job), or Red (anything unsafe or inappropriate for a teenager: roofs, tall ladders, chainsaws, electrical/gas, chemicals, driving the customer, alcohol, firearms, after dark, anything about a student's looks).
- risk_notes: short reasons for a Yellow or Red tier.
- confidence: 0-1, how sure you are the request is clear and genuine.
${UNTRUSTED_RULE}`,
      prompt: `Service picked on the form: ${job.service}\n${quoteUntrusted('job request', job.details)}`,
    },
    (value): value is Assessment =>
      isObject(value) && typeof value.summary === 'string' && ['Green', 'Yellow', 'Red'].includes(value.tier as string) && typeof value.confidence === 'number',
  );
  if (assessment) {
    const raised = maxTier(safety.tier, assessment.tier);
    if (raised !== safety.tier) safety.reasons.push(...stringArray(assessment.risk_notes).map((note) => `${note} (flagged by AI review)`));
    safety.tier = raised;
  }

  if (safety.tier === 'Red') {
    const result = await refine({
      ctx, config, agent: 'safety', channel: 'email', facts: factText,
      draftWithModel: draftRequest(ctx, config, 'safety', 'decline reply',
        'Write a short, kind email body (no subject, no sign-off name) politely declining a job because it is not something high-school students can do safely. Do not lecture, do not list the reasons in detail, and suggest a licensed professional for this kind of work.',
        `Neighbor first name: ${neighbor}\nService: ${service}\nWhy we can't take it (do not quote this verbatim): ${safety.reasons.join('; ')}`),
      template: () =>
        `Hi ${neighbor}, thanks for thinking of us! Unfortunately this one isn't something we can take on as high school students, so it's best handled by a licensed pro. If you ever need help with yard work, snow, or hauling, we'd love to help.`,
    });
    return {
      priority: 2,
      draft: {
        ...base,
        agent: 'safety',
        title: `Unsafe for students: ${service} for ${job.name}`,
        summary: `Red tier: ${safety.reasons.join('; ')}. Approving declines the job and emails the neighbor. Overriding to approve the job needs two different admins.`,
        text: result.text,
        channel: 'email',
        action: { kind: 'decline_job', jobId: job.id, note: `Declined for safety: ${safety.reasons.join('; ')}`, notifyNeighbor: true },
        safety: { ...safety, messageProblems: result.problems },
        voice: result.voice,
        confidence: assessment?.confidence ?? 0.8,
        source: result.source,
        revisions: result.revisions,
        flags: [...result.flags, 'two_admins_to_override', ...(job.email ? [] : ['no_email'])],
        facts,
      },
    };
  }

  // 4. Missing information — one question covering every gap.
  const missing: string[] = [];
  if (words(job.details) < 4) missing.push('a bit more about the job (what needs doing and roughly how big)');
  if (assessment) missing.push(...stringArray(assessment.critical_missing).slice(0, 2));
  if (missing.length && job.email) {
    const result = await refine({
      ctx, config, agent: 'intake', channel: 'email', facts: factText,
      draftWithModel: draftRequest(ctx, config, 'intake', 'clarifying question',
        'Write a short, friendly email body (no subject, no sign-off name) asking the neighbor for the missing details in one message, so we can match them with a student.',
        `Neighbor first name: ${neighbor}\nService: ${service}\nWhat we still need: ${missing.join('; ')}\n${quoteUntrusted('job request', job.details)}`),
      template: () =>
        `Hi ${neighbor}, thanks for the ${service.toLowerCase()} request! Before we match you with one of us, could you tell us ${missing.join(', and ')}? Just reply to this email and we'll take it from there.`,
    });
    return {
      priority: 1,
      draft: {
        ...base,
        title: `Needs details: ${service} for ${job.name}`,
        summary: `Missing ${missing.join('; ')}. Approving emails this question; the job stays New until they reply.`,
        text: result.text,
        channel: 'email',
        action: { kind: 'message_neighbor', jobId: job.id, subject: `Quick question about your ${service.toLowerCase()} request` },
        safety: { ...safety, messageProblems: result.problems },
        voice: result.voice,
        confidence: assessment?.confidence ?? 0.7,
        source: result.source,
        revisions: result.revisions,
        flags: result.flags,
        facts,
      },
    };
  }

  // 5. Good to go — approve, carrying any Yellow conditions to the Matchmaker.
  const hours = hoursUntil(job.date, now);
  const urgent = service === 'Snow shoveling' || (hours !== null && hours <= 24);
  const confidence = assessment?.confidence ?? (town && service.toLowerCase() === job.service.toLowerCase() ? 0.85 : 0.65);
  const conditionText = [
    safety.conditions.pairRequired ? 'two Butlers' : '',
    safety.conditions.minGrade ? `${safety.conditions.minGrade} or older` : '',
    'daylight only',
  ].filter(Boolean).join(', ');
  const flags: string[] = [];
  if (confidence < config.lowConfidence) flags.push('low_confidence');
  if (guidance.belowFloor) flags.push('budget_below_floor');
  if (!town) flags.push('town_unknown');
  if (!assessment) flags.push('template');
  // Reaching here with gaps means there was no email to ask through.
  if (missing.length) flags.push('missing_details');

  return {
    priority: urgent ? 3 : safety.tier === 'Yellow' ? 2 : 1,
    draft: {
      ...base,
      title: `${urgent ? 'Urgent: ' : ''}Approve ${service} for ${job.name}`,
      summary: [
        assessment?.summary ?? `${service} request${area ? ` in ${area}` : ''}.`,
        safety.tier === 'Yellow' ? `Yellow tier (${safety.reasons.join('; ')}): approve with conditions — ${conditionText}.` : 'Green tier.',
        guidance.belowFloor ? `Budget is below our usual floor; suggest $${guidance.low}–$${guidance.high}.` : '',
        !town ? "Couldn't tell which town this is in — check the address." : '',
        missing.length ? `No email on file to ask for ${missing.join('; ')} — call them first.` : '',
      ].filter(Boolean).join(' '),
      text: '',
      channel: 'none',
      action: { kind: 'approve_job', jobId: job.id },
      safety,
      confidence,
      source: assessment ? 'model' : 'template',
      flags,
      facts: [...facts, ['Conditions', conditionText]],
    },
  };
}
