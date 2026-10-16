/*
 * A5 Lead Scout: a post an admin pasted from Nextdoor (or a DM, or an
 * email) becomes either nothing, or a ready-to-paste personal reply.
 *
 * Nextdoor has no posting API and replies have to read as a neighbor
 * talking, so the output is a copy pack: the admin copies a variant,
 * pastes it from their own account, and taps "Mark posted".
 */
import type { AgentConfig } from './config.ts';
import type { AgentContext } from './llm.ts';
import { askModel, isObject, quoteUntrusted, stringArray, UNTRUSTED_RULE } from './llm.ts';
import { detectTown, normalizeService, ruleSafety, screenMessage, similarity } from './rules.ts';
import type { Channel, Draft, Lead } from './types.ts';
import { checkVoiceRules, draftRequest, refine } from './voice.ts';

export type LeadIntent = 'NEEDS_HELP' | 'ASKING_RECOMMENDATION' | 'OFF_TOPIC';

const ASK = /\b(anyone|any recommendations?|recommend|looking for|need(s|ed)? (help|someone|a)|does anyone know|can someone|who do you use|hire|help with)\b/i;
const OFFER = /\b(i offer|we offer|my (business|company)|dm me for (rates|quotes)|for hire|available for)\b/i;

export function classifyLead(text: string): { intent: LeadIntent; service: string } {
  const service = normalizeService('', text);
  if (OFFER.test(text)) return { intent: 'OFF_TOPIC', service };
  if (!ASK.test(text)) return { intent: 'OFF_TOPIC', service };
  return { intent: /recommend|who do you use/i.test(text) ? 'ASKING_RECOMMENDATION' : 'NEEDS_HELP', service };
}

export function scoreLead(lead: Lead, config: AgentConfig, now: Date, intent: LeadIntent, service: string, unsafe: boolean): number {
  if (intent === 'OFF_TOPIC' || unsafe) return 0;
  const town = detectTown(`${lead.town} ${lead.text}`, config);
  const area = !town ? 0.7 : town.active ? 1 : config.serviceAreas.some((a) => a.active && a.adjacent.includes(town.town)) ? 0.5 : 0;
  const ageHours = (+now - +new Date(lead.createdAt)) / 3600000;
  const recency = ageHours < 24 ? 1 : ageHours < 72 ? 0.6 : 0.2;
  const urgency = /\b(asap|today|tomorrow|this weekend|urgent|snow)\b/i.test(lead.text) ? 1.2 : 1;
  const fit = service === 'Odd job' ? 0.7 : 1;
  return Math.min(1, Math.round(fit * area * recency * urgency * 100) / 100);
}

const CLASSIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'service', 'town', 'reason'],
  properties: {
    intent: { type: 'string', enum: ['NEEDS_HELP', 'ASKING_RECOMMENDATION', 'OFF_TOPIC'] },
    service: { type: 'string' },
    town: { type: 'string' },
    reason: { type: 'string' },
  },
};

export interface LeadResult {
  /** Null means drop: not a lead worth replying to. */
  draft: Draft | null;
  score: number;
  reason: string;
}

export async function runLeadScout(
  lead: Lead,
  postedReplies: string[],
  ctx: AgentContext,
  config: AgentConfig,
  now: Date,
  adminFirstName: string,
): Promise<LeadResult> {
  let { intent, service } = classifyLead(lead.text);
  let town = lead.town || detectTown(lead.text, config)?.town || '';
  let reason = '';

  const model = await askModel(
    ctx,
    {
      agent: 'lead_scout',
      purpose: 'classify lead',
      effort: 'low',
      schema: CLASSIFY_SCHEMA,
      system: `You sort social posts for a student-run neighborhood help service (yard work, snow shoveling, moving help, junk hauling, cleanouts, dog walking, odd jobs) in the Chicago suburbs.
intent: NEEDS_HELP if the poster wants someone to do a job, ASKING_RECOMMENDATION if they ask who to hire, OFF_TOPIC otherwise (including businesses advertising).
service: the closest of Yard work, Snow shoveling, Moving help, Junk hauling, Cleanout, Dog walking, Odd job.
town: the town if mentioned, else "".
reason: one short sentence. ${UNTRUSTED_RULE}`,
      prompt: quoteUntrusted(`${lead.channel} post`, lead.text),
    },
    (value): value is { intent: LeadIntent; service: string; town: string; reason: string } =>
      isObject(value) && ['NEEDS_HELP', 'ASKING_RECOMMENDATION', 'OFF_TOPIC'].includes(value.intent as string) && typeof value.service === 'string',
  );
  if (model) {
    intent = model.intent;
    service = normalizeService(model.service, '');
    town = town || model.town;
    reason = model.reason;
  }

  const safety = ruleSafety({ id: lead.id, service, name: '', phone: '', email: '', address: town, date: '', budget: '', details: lead.text, submittedAt: lead.createdAt, status: 'New', assignedButlerId: null, assignedAt: null, completedAt: null }, service, config);
  const score = scoreLead({ ...lead, town }, config, now, intent, service, safety.tier === 'Red');
  if (score < 0.5) {
    const why =
      intent === 'OFF_TOPIC' ? reason || 'Not someone asking for help'
        : safety.tier === 'Red' ? `Not safe for students (${safety.reasons.join('; ')})`
          : 'Outside our area or too old to reply to';
    return { draft: null, score, reason: why };
  }

  const channel: Channel = lead.channel === 'instagram' ? 'instagram' : 'nextdoor';
  const me = adminFirstName || 'one of the Community Butler students';
  const facts = `Service: ${service}\nTown: ${town || 'nearby'}\nWho is replying: ${me}, a ${config.schoolShortName} student\nWhat we do: high school students who help neighbors with ${service.toLowerCase()}\nHow to book: the request form on our website`;
  const instructions = `Write a reply to a neighbor's ${channel === 'nextdoor' ? 'Nextdoor' : 'Instagram'} post, in the first person, as ${me}, a high school student at ${config.schoolShortName} who does this work with friends. 40-90 words. Sound like a neighbor, not a business: no hashtags, no "our company", no hard sell. Offer to help and say they can message back. Do not include links, phone numbers, or prices.`;

  const variants: string[] = [];
  let first = null as Awaited<ReturnType<typeof refine>> | null;
  for (const angle of ['warm and direct', 'mention the school and the town once']) {
    const result = await refine({
      ctx, config, agent: 'lead_scout', channel, facts,
      draftWithModel: draftRequest(ctx, config, 'lead_scout', `${channel} reply`, `${instructions} Angle: ${angle}.${variants.length ? ` Make it clearly different from this other variant: "${variants[0]}"` : ''}`,
        `${facts}\n\n${quoteUntrusted(`${channel} post`, lead.text)}`),
      template: () =>
        variants.length === 0
          ? `Hi! I'm ${me}, a ${config.schoolShortName} student. A few of us help neighbors with ${service.toLowerCase()} around ${town || 'town'}, and we'd be happy to help with this. Send me a message and we can figure out a time that works.`
          : `Hey, this is ${me}. I'm in high school at ${config.schoolShortName} and a group of us do ${service.toLowerCase()} for neighbors${town ? ` in ${town}` : ''}. If you still need a hand, message me and we'll sort out the details.`,
    });
    first = first ?? result;
    variants.push(result.text);
  }

  // Too close to something already posted reads as spam on Nextdoor.
  const tooSimilar = variants.some((v) => postedReplies.some((p) => similarity(v, p) > 0.7));
  const problems = screenMessage(variants[0], channel, config);
  const flags = [...(first?.flags ?? [])];
  if (tooSimilar) flags.push('too_similar_to_past_reply');
  if (problems.length && !flags.includes('blocked_message')) flags.push('blocked_message');

  return {
    score,
    reason: reason || `${intent === 'NEEDS_HELP' ? 'Asking for help' : 'Asking for a recommendation'} with ${service.toLowerCase()}`,
    draft: {
      agent: 'lead_scout',
      title: `Reply on ${channel === 'nextdoor' ? 'Nextdoor' : 'Instagram'}: ${service}${town ? ` in ${town}` : ''}`,
      summary: `${reason || 'Neighbor asking for help'}. Lead score ${score}. Copy a variant, post it from your own account, then tap Mark posted.`,
      text: variants[0],
      variants,
      channel,
      action: { kind: 'mark_posted', leadId: lead.id },
      safety: { ...safety, messageProblems: problems },
      voice: first?.voice ?? checkVoiceRules(variants[0], channel, config),
      confidence: score,
      source: first?.source ?? 'template',
      revisions: first?.revisions ?? 0,
      flags: [...new Set(flags)],
      facts: [
        ['Service', service],
        ['Town', town || 'Unknown'],
        ['Intent', intent === 'NEEDS_HELP' ? 'Needs help' : 'Asking for a recommendation'],
        ['Score', String(score)],
        ['Reasons', stringArray(safety.reasons).join('; ') || '—'],
      ],
    },
  };
}
