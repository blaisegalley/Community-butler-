/*
 * A6 B2B + Web Studio: the two bigger-ticket pipelines.
 *
 * B2B outreach: an admin adds a realtor, property manager, HOA or small
 * business. The agent qualifies it (in our area? recurring need? an email
 * to write to?), drafts a first email, and drafts follow-ups on day 5 and
 * day 12 — stopping the moment an admin marks that they replied.
 *
 * Web Studio: a website inquiry is qualified against the $700-$1,250
 * tiers and gets a proposal email (or a kind referral if it doesn't fit).
 * When an admin marks it won, the agent writes the build brief and QA
 * checklist for the student who will build it with Claude Code.
 */
import type { AgentConfig, WebTier } from './config.ts';
import type { AgentContext } from './llm.ts';
import { askModel, isObject, quoteUntrusted, stringArray, UNTRUSTED_RULE } from './llm.ts';
import { daysBetween, detectTown, parseBudget } from './rules.ts';
import type { Draft, Lead, NewTask, SafetyResult } from './types.ts';
import { draftRequest, refine } from './voice.ts';

const NO_RISK: SafetyResult = { tier: 'Green', reasons: [], conditions: { pairRequired: false, minGrade: '', daylightOnly: true }, messageProblems: [] };

export const SEGMENTS: Record<string, string> = {
  realtor: 'Real estate agent',
  property_manager: 'Property manager',
  hoa: 'HOA',
  small_business: 'Small business',
};

/** Which outreach and website cards should exist, given the leads and what has already run. */
export function planOutreach(leads: Lead[], index: Map<string, { createdAt: string; state: string }>, config: AgentConfig, now: Date): NewTask[] {
  const out: NewTask[] = [];
  const add = (task: NewTask) => {
    if (!index.has(task.idempotencyKey)) out.push(task);
  };
  for (const lead of leads) {
    if (lead.channel === 'b2b') {
      if (lead.status === 'new') add({ type: 'B2B_OUTREACH', subjectType: 'lead', subjectId: lead.id, idempotencyKey: `lead:${lead.id}:b2b:0`, priority: 1 });
      if (lead.status !== 'contacted') continue;
      for (let step = 1; step < config.b2b.maxTouches; step++) {
        const previous = index.get(`lead:${lead.id}:b2b:${step - 1}`);
        const dueAfter = config.b2b.followupDays[step - 1] ?? Infinity;
        if (previous?.state === 'done' && daysBetween(lead.createdAt, now) >= dueAfter) {
          add({ type: 'B2B_OUTREACH', subjectType: 'lead', subjectId: lead.id, idempotencyKey: `lead:${lead.id}:b2b:${step}`, priority: 1 });
        }
      }
    }
    if (lead.channel === 'web') {
      if (lead.status === 'new') add({ type: 'WEB_LEAD', subjectType: 'lead', subjectId: lead.id, idempotencyKey: `lead:${lead.id}:web`, priority: 2 });
      if (lead.status === 'won') add({ type: 'WEB_BRIEF', subjectType: 'lead', subjectId: lead.id, idempotencyKey: `lead:${lead.id}:brief`, priority: 2 });
    }
  }
  return out;
}

export type OutreachResult = { draft: Draft; priority: number } | { close: string; leadStatus?: Lead['status'] };

function signOff(lead: Lead, config: AgentConfig): string {
  return `${lead.author || 'The team'}\n${config.businessName} · ${config.businessPhone}`;
}

export function qualifyBusiness(lead: Lead, config: AgentConfig): { ok: boolean; reasons: string[]; town: string } {
  const town = detectTown(`${lead.town} ${lead.text}`, config);
  const reasons: string[] = [];
  const nearActive = town && (town.active || config.serviceAreas.some((a) => a.active && a.adjacent.includes(town.town)));
  if (!town) reasons.push('No town given, so we can\'t tell if they\'re in our area');
  else if (!nearActive) reasons.push(`${town.town} is outside the area we serve`);
  if (!lead.details.email) reasons.push('No email address to write to');
  if (!SEGMENTS[lead.details.segment ?? '']) reasons.push('Pick what kind of business this is');
  return { ok: reasons.length === 0, reasons, town: town?.town ?? lead.town };
}

export async function runOutreach(lead: Lead, step: number, ctx: AgentContext, config: AgentConfig): Promise<OutreachResult> {
  if (['replied', 'won', 'dropped'].includes(lead.status)) return { close: `They're marked ${lead.status} — follow-ups stop` };
  const q = qualifyBusiness(lead, config);
  if (!q.ok) return { close: `Not qualified: ${q.reasons.join('; ')}`, leadStatus: 'dropped' };

  const segment = lead.details.segment;
  const org = lead.details.org || 'your business';
  const contact = (lead.details.contactName || '').split(' ')[0] || 'there';
  const offer = config.b2b.playbook[segment] ?? '';
  const facts = `Business: ${org} (${SEGMENTS[segment]}) in ${q.town}\nContact first name: ${contact}\nWhat we can do for them: ${offer}\nWho we are: high school students from ${config.schoolShortName} who do local jobs as ${config.businessName}\nHow they reach us: reply to this email or call ${config.businessPhone}\nSigned by: ${lead.author || 'the team'}`;
  const which = ['first email', 'friendly follow-up (they haven\'t replied yet)', 'last short note (we won\'t email again)'][step] ?? 'follow-up';
  const subject = step === 0 ? `Local student help for ${org}` : step === 1 ? `Following up: student help in ${q.town}` : `One last note from ${config.businessName}`;

  const result = await refine({
    ctx, config, agent: 'b2b', channel: 'email', facts,
    draftWithModel: draftRequest(ctx, config, 'b2b', `B2B ${which}`,
      `Write the body of a ${which} to a local ${SEGMENTS[segment].toLowerCase()}. Under 120 words, no subject line. Be specific about one or two things we could do for them, written as a student, not a company. ${step > 0 ? 'Reference the earlier email in one short line; do not guilt them.' : ''} End with the sign-off given in the facts.`,
      `${facts}\n${quoteUntrusted('admin notes about this business (may include text copied from their website)', lead.text)}`),
    template: () =>
      step === 0
        ? `Hi ${contact},\n\nI'm ${lead.author || 'one of the students'} from ${config.businessName}, a group of ${config.schoolShortName} students who help around ${q.town}. We can help with things like ${offer.charAt(0).toLowerCase()}${offer.slice(1)} If that could take something off your plate, just reply and we'll set it up.\n\n${signOff(lead, config)}`
        : step === 1
          ? `Hi ${contact},\n\nJust following up on my note from last week. If ${org} could use help with any of this, we're around and easy to book. Reply here anytime.\n\n${signOff(lead, config)}`
          : `Hi ${contact},\n\nI won't keep filling your inbox, so this is my last note. If you ever need a hand, just reply to this email and we'll take it from there.\n\n${signOff(lead, config)}`,
  });

  return {
    priority: 1,
    draft: {
      agent: 'b2b',
      title: `${step === 0 ? 'Outreach' : `Follow-up ${step}`}: ${org} (${SEGMENTS[segment]})`,
      summary: step === 0
        ? `Qualified: in our area, a ${SEGMENTS[segment].toLowerCase()} with recurring work, and we have an email. Approving sends this from the business email.`
        : `No reply yet, ${Math.round(daysBetween(lead.createdAt, new Date()))} days after the first email. Mark them replied in Prospects and follow-ups stop.`,
      text: result.text,
      variants: [],
      channel: 'email',
      action: { kind: 'send_email', to: lead.details.email, subject, leadId: lead.id, leadStatus: 'contacted' },
      safety: { ...NO_RISK, messageProblems: result.problems },
      voice: result.voice,
      confidence: 0.8,
      source: result.source,
      revisions: result.revisions,
      flags: result.flags,
      facts: [['Business', org], ['Type', SEGMENTS[segment]], ['Town', q.town], ['To', lead.details.email], ['Touch', `${step + 1} of ${config.b2b.maxTouches}`]],
    },
  };
}

// ------------------------------------------------------------------ web studio

const SCOPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pages_needed', 'features', 'summary'],
  properties: {
    pages_needed: { type: 'integer' },
    features: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
};

export function pickTier(pages: number, budget: number | null, needs: string, config: AgentConfig): WebTier {
  const tiers = [...config.webStudio.tiers].sort((a, b) => a.price - b.price);
  const wantsPlus = /\b(store|shop|e-?commerce|online booking|blog)\b/i.test(needs);
  const wantsStandard = /\b(gallery|portfolio|menu|booking|reviews)\b/i.test(needs);
  let tier = tiers.find((t) => t.maxPages >= pages) ?? tiers[tiers.length - 1];
  if (wantsPlus) tier = tiers[tiers.length - 1];
  else if (wantsStandard && tier === tiers[0] && tiers[1]) tier = tiers[1];
  // Stay inside a stated budget when a cheaper tier still covers the pages.
  if (budget !== null && tier.price > budget) {
    const affordable = tiers.filter((t) => t.price <= budget && t.maxPages >= pages).pop();
    if (affordable) tier = affordable;
  }
  return tier;
}

async function scope(lead: Lead, ctx: AgentContext, purpose: string) {
  return askModel<{ pages_needed: number; features: string[]; summary: string }>(
    ctx,
    {
      agent: 'web_studio',
      purpose,
      effort: 'low',
      schema: SCOPE_SCHEMA,
      system: `You scope small-business websites for a student web studio. From the inquiry, estimate how many pages the site needs (count home, services, about, contact, gallery and so on), list the features asked for in a few words each, and write a one-sentence summary. ${UNTRUSTED_RULE}`,
      prompt: `Business: ${lead.details.org ?? ''}\n${quoteUntrusted('website inquiry', lead.text)}`,
    },
    (value): value is { pages_needed: number; features: string[]; summary: string } =>
      isObject(value) && typeof value.pages_needed === 'number' && typeof value.summary === 'string',
  );
}

export async function runWebLead(lead: Lead, ctx: AgentContext, config: AgentConfig): Promise<OutreachResult> {
  if (lead.status !== 'new') return { close: `Already ${lead.status}` };
  if (!lead.details.email) return { close: 'No email to send a proposal to', leadStatus: 'dropped' };
  const org = lead.details.org || 'your business';
  const contact = (lead.details.contactName || '').split(' ')[0] || 'there';
  const budget = parseBudget(lead.details.budget ?? '');
  const town = detectTown(`${lead.town} ${lead.text}`, config);
  const scoped = await scope(lead, ctx, 'scope website inquiry');
  const pages = scoped?.pages_needed ?? Number(lead.text.match(/(\d+)\s*pages?/i)?.[1] ?? 3);
  const flags: string[] = [];
  if (!town) flags.push('outside_area');
  if (budget === null) flags.push('budget_unknown');

  if (budget !== null && budget < config.webStudio.minBudget) {
    const result = await refine({
      ctx, config, agent: 'web_studio', channel: 'email', facts: `Business: ${org}\nTheir budget: $${budget}\nOur lowest package: $${config.webStudio.minBudget}`,
      draftWithModel: draftRequest(ctx, config, 'web_studio', 'website referral', 'Write a short, kind email body explaining our websites start at our lowest package price, so we are probably not the right fit at their budget, and suggest a free website builder (like Google Business Profile or a simple Squarespace/Wix template) as a starting point. Under 90 words. No sign-off name.', `Contact first name: ${contact}`),
      template: () => `Hi ${contact},\n\nThanks for thinking of us for ${org}'s website! Our sites start at $${config.webStudio.minBudget}, so we're probably not the right fit at your budget right now. A free Google Business Profile or a simple website-builder template is a great place to start, and we'd be glad to help later on if you need more.\n\n${signOff(lead, config)}`,
    });
    return {
      priority: 1,
      draft: {
        agent: 'web_studio',
        title: `Website inquiry under budget: ${org}`,
        summary: `Budget $${budget} is below our $${config.webStudio.minBudget} Starter package. Approving sends a kind referral and closes the inquiry.`,
        text: result.text, variants: [], channel: 'email',
        action: { kind: 'send_email', to: lead.details.email, subject: `Your website inquiry`, leadId: lead.id, leadStatus: 'dropped' },
        safety: { ...NO_RISK, messageProblems: result.problems }, voice: result.voice, confidence: 0.85,
        source: result.source, revisions: result.revisions, flags: [...result.flags, ...flags],
        facts: [['Business', org], ['Budget', `$${budget}`], ['Pages', String(pages)]],
      },
    };
  }

  const tier = pickTier(pages, budget, `${lead.text} ${(scoped?.features ?? []).join(' ')}`, config);
  const facts = `Business: ${org}\nContact first name: ${contact}\nPackage: ${tier.name}, $${tier.price}\nIncludes: ${tier.includes.join('; ')}\nRevision rounds included: ${config.webStudio.revisionRounds}\nTimeline: about 2-3 weeks once we have their text and photos\nNext step: reply to set up a 15-minute call\nWho builds it: ${config.schoolShortName} students, using AI tools, reviewed by us\nSigned by: ${lead.author || 'the team'}`;
  const result = await refine({
    ctx, config, agent: 'web_studio', channel: 'email', facts,
    draftWithModel: draftRequest(ctx, config, 'web_studio', 'website proposal', 'Write a short proposal email body (no subject) recommending the package in the facts: what it includes as a short list, the price, revisions, timeline, and the next step. Under 160 words. Do not promise search rankings or traffic. End with the sign-off name from the facts.', `${facts}\n${quoteUntrusted('website inquiry', lead.text)}`),
    template: () =>
      `Hi ${contact},\n\nThanks for reaching out about a website for ${org}! Based on what you described, our ${tier.name} package ($${tier.price}) is the best fit:\n${tier.includes.map((i) => `- ${i}`).join('\n')}\n\nIt includes ${config.webStudio.revisionRounds} rounds of changes, and takes about 2-3 weeks once we have your text and photos. If that sounds good, reply and we'll set up a quick 15-minute call.\n\n${signOff(lead, config)}`,
  });
  if (result.text.length > 1100) flags.push('long');
  return {
    priority: 2,
    draft: {
      agent: 'web_studio',
      title: `Website proposal: ${tier.name} ($${tier.price}) for ${org}`,
      summary: `${scoped?.summary ?? 'Website inquiry.'} About ${pages} page${pages === 1 ? '' : 's'}${scoped?.features.length ? `; asks for ${stringArray(scoped.features).slice(0, 4).join(', ')}` : ''}. ${budget !== null ? `Budget $${budget}.` : 'No budget given.'} When they say yes, mark them Won in Prospects to get the build brief.`,
      text: result.text, variants: [], channel: 'email',
      action: { kind: 'send_email', to: lead.details.email, subject: `Website proposal for ${org}`, leadId: lead.id, leadStatus: 'contacted' },
      safety: { ...NO_RISK, messageProblems: result.problems }, voice: result.voice,
      confidence: scoped ? 0.8 : 0.65, source: result.source, revisions: result.revisions,
      flags: [...result.flags, ...flags],
      facts: [['Business', org], ['Package', `${tier.name} · $${tier.price}`], ['Pages', String(pages)], ['Budget', budget !== null ? `$${budget}` : 'Not given'], ['Town', town?.town ?? (lead.town || 'Unknown')]],
    },
  };
}

/** The build brief for a won website, for the student building it with Claude Code. Internal only. */
export async function runWebBrief(lead: Lead, ctx: AgentContext, config: AgentConfig): Promise<OutreachResult> {
  if (lead.status !== 'won') return { close: `Not won (${lead.status})` };
  const org = lead.details.org || 'Client';
  const budget = parseBudget(lead.details.budget ?? '');
  const scoped = await scope(lead, ctx, 'scope website build');
  const pages = scoped?.pages_needed ?? 3;
  const tier = pickTier(pages, budget, lead.text, config);
  const pageList = ['Home', 'Services', 'About', 'Contact', 'Gallery', 'Reviews', 'FAQ', 'Blog', 'Booking', 'Shop'].slice(0, Math.max(3, Math.min(pages, tier.maxPages)));
  const text = [
    `BUILD BRIEF: ${org}`,
    `Package: ${tier.name} ($${tier.price}), up to ${tier.maxPages} pages, ${config.webStudio.revisionRounds} revision rounds`,
    `Client contact: ${lead.details.contactName || '—'}, ${lead.details.email || '—'}${lead.details.website ? `, current site ${lead.details.website}` : ''}`,
    '',
    `What they asked for: ${scoped?.summary ?? lead.text.slice(0, 300)}`,
    scoped?.features.length ? `Features: ${scoped.features.join(', ')}` : '',
    '',
    'Pages (confirm with the client before building):',
    ...pageList.map((p) => `- ${p}`),
    '',
    'Get from the client before starting: logo, 5-10 photos, the text for each page (or bullet points to write from), hours/location, and who owns the domain.',
    '',
    'Paste this brief into Claude Code as the starting prompt, together with the client\'s text and photos.',
    '',
    'QA CHECKLIST (all must pass before the client review):',
    ...config.webStudio.qaChecklist.map((item) => `[ ] ${item}`),
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
  return {
    priority: 2,
    draft: {
      agent: 'web_studio',
      title: `Build brief: ${org} website (${tier.name})`,
      summary: 'They said yes. Hand this brief and QA checklist to the student who will build it. Nothing is sent to the client.',
      text, variants: [], channel: 'internal', action: { kind: 'acknowledge' },
      safety: NO_RISK, voice: null, confidence: scoped ? 0.8 : 0.6, source: scoped ? 'model' : 'template', revisions: 0, flags: scoped ? [] : ['template'],
      facts: [['Client', org], ['Package', `${tier.name} · $${tier.price}`], ['Pages', String(pageList.length)]],
    },
  };
}
