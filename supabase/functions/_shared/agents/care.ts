/*
 * A8 Care: what happens after a job is marked Completed.
 *
 *   4-5 stars  -> thank-you email that asks for a Nextdoor recommendation
 *   1-3 stars  -> an incident card for the admins (nothing goes to the neighbor)
 *   no rating  -> a plain thank-you
 *
 * Seasonal rebooking ("we raked in October — snow this winter?") rides on
 * the thank-you rather than being a separate message, so a neighbor gets
 * one email, not two.
 */
import type { AgentConfig } from './config.ts';
import type { AgentContext } from './llm.ts';
import { quoteUntrusted } from './llm.ts';
import { coarseArea, firstName, normalizeService, ruleSafety } from './rules.ts';
import type { AgentButler, AgentJob, Draft } from './types.ts';
import { draftRequest, refine } from './voice.ts';

function nextSeason(service: string, completedAt: string): string {
  const month = new Date(completedAt).getMonth(); // 0 = Jan
  if (service === 'Yard work' && month >= 8 && month <= 10) return 'snow shoveling this winter';
  if (service === 'Snow shoveling' && month >= 1 && month <= 3) return 'spring yard cleanup';
  if (service === 'Yard work' && month >= 3 && month <= 5) return 'help through the summer';
  return '';
}

export async function runCare(
  job: AgentJob,
  butler: AgentButler | null,
  ctx: AgentContext,
  config: AgentConfig,
): Promise<{ draft: Draft; priority: number }> {
  const service = normalizeService(job.service, job.details);
  const town = coarseArea(job.address, config);
  const neighbor = firstName(job.name) || 'there';
  const helper = butler ? firstName(butler.name) : 'our Butler';
  const safety = ruleSafety(job, service, config);
  const facts: [string, string][] = [
    ['Service', service],
    ['Town', town || 'Unknown'],
    ['Butler', butler?.name ?? 'Unknown'],
    ['Rating', job.rating ? `${job.rating}★` : 'Not rated'],
  ];

  if (job.rating !== undefined && job.rating <= 3) {
    return {
      priority: 3,
      draft: {
        agent: 'care',
        title: `Low rating: ${job.rating}★ on ${service} by ${butler?.name ?? 'a Butler'}`,
        summary: `${job.name} rated this ${job.rating}★. Call the neighbor and check in with ${helper} before either works together again. Nothing has been sent to anyone.`,
        text: `Incident check-in\nJob: ${service}${town ? ` in ${town}` : ''}, completed ${job.completedAt?.slice(0, 10) ?? ''}\nNeighbor: ${job.name}, ${job.phone || job.email}\nButler: ${butler?.name ?? 'Unknown'}\nRating: ${job.rating}★\nJob notes from the request: ${job.details.slice(0, 300)}\n\nNext steps: call the neighbor, talk to the Butler, decide whether to pause this pairing.`,
        variants: [],
        channel: 'internal',
        action: { kind: 'acknowledge' },
        safety,
        voice: null,
        confidence: 1,
        source: 'template',
        revisions: 0,
        flags: ['incident'],
        facts,
      },
    };
  }

  const happy = job.rating !== undefined && job.rating >= 4;
  const season = nextSeason(service, job.completedAt ?? job.submittedAt);
  const factText = `Neighbor first name: ${neighbor}\nService: ${service}\nTown: ${town || 'nearby'}\nStudent who did it: ${helper}\nRating they gave: ${job.rating ?? 'none'}${season ? `\nNext season we could help with: ${season}` : ''}`;
  const result = await refine({
    ctx, config, agent: 'care', channel: 'email', facts: factText,
    draftWithModel: draftRequest(ctx, config, 'care', 'thank-you email',
      `Write a short thank-you email body (no subject, no sign-off name) to a neighbor after a job.${happy ? ' Ask, lightly, whether they would recommend us on Nextdoor, since that is how other neighbors find us.' : ''}${season ? ` Mention, in one sentence, that we can also help with ${season}.` : ''} Under 90 words.`,
      `${factText}\n${quoteUntrusted('job request', job.details.slice(0, 300))}`),
    template: () =>
      [
        `Hi ${neighbor}, thanks for having ${helper} out for your ${service.toLowerCase()}!`,
        happy ? "If you were happy with it, a quick recommendation on Nextdoor would mean a lot. It's how most neighbors find us." : '',
        season ? `We can also help with ${season} whenever you need it.` : '',
        'Thanks for supporting local students.',
      ].filter(Boolean).join(' '),
  });

  return {
    priority: 1,
    draft: {
      agent: 'care',
      title: `${happy ? 'Thank-you + review ask' : 'Thank-you'}: ${service} for ${job.name}`,
      summary: `Job completed${job.rating ? ` and rated ${job.rating}★` : ''}. Approving emails the neighbor.${season ? ` Includes a nudge about ${season}.` : ''}`,
      text: result.text,
      variants: [],
      channel: 'email',
      action: { kind: 'message_neighbor', jobId: job.id, subject: happy ? `Thanks from ${config.businessName}` : `Thanks for having us out` },
      safety: { ...safety, messageProblems: result.problems },
      voice: result.voice,
      confidence: 0.9,
      source: result.source,
      revisions: result.revisions,
      flags: [...result.flags, ...(job.email ? [] : ['no_email'])],
      facts,
    },
  };
}
