import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const PLATFORM_NOTES = {
  instagram: 'Instagram — can lean a little more casual and visual (there will be a photo attached). Keep it short enough to read in one glance.',
  facebook: 'Facebook — similar tone to Instagram, slightly more room for a sentence of context since Facebook readers scroll slower.',
  nextdoor: 'Nextdoor — neighbors talking to neighbors. More direct and practical, less "content-y." No emoji spam.',
};

function systemPrompt(platform) {
  const platformNote = PLATFORM_NOTES[platform] || platform;
  return `You are writing social media captions for Community Butler, a Barrington High School-founded service connecting local high school students ("Butlers") with neighbors who need help with yard work, snow shoveling, moving, junk hauling, dog walking, and odd jobs.

Voice rules:
- Sound human and casual, never corporate, never like an AI wrote it.
- This is a BHS-rooted, Barrington-founded operation — write like a local student business, not an outside company pitching the neighborhood.
- Acknowledge the specific job/task before pitching the brand.
- Keep it short. No hashtag spam. No exclamation-point overload.
- End with a simple, clear way to request help (a link will be appended separately, so don't invent one).

Given the job details below, write 2 short caption variants for ${platform}.
Platform notes: ${platformNote}

Respond with ONLY the 2 captions, each on its own line, separated by a line containing exactly "---". No numbering, no labels, no extra commentary.`;
}

function describeJob(jobData) {
  if (!jobData) return 'No specific job — write a general seasonal post for Community Butler.';
  const lines = [
    jobData.service && `Service: ${jobData.service}`,
    jobData.details && `Details: ${jobData.details}`,
    jobData.address && `Neighborhood/area: ${jobData.address}`,
  ].filter(Boolean);
  return lines.join('\n') || 'A completed Community Butler job.';
}

function splitVariants(text) {
  const parts = text
    .split(/\n\s*---\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Fall back to splitting on blank lines if the model didn't use the separator.
  if (parts.length < 2) {
    const byBlank = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    if (byBlank.length >= 2) return byBlank.slice(0, 2);
    return parts.length ? [parts[0], parts[0]] : [text.trim(), text.trim()];
  }
  return parts.slice(0, 2);
}

/**
 * Calls the Anthropic API to draft 2 caption variants for a job + platform.
 * jobData is a plain object with at least `service` and `details` — either a
 * real completed Job, or a synthetic one built for a seasonal/weather trigger.
 */
export async function generateCaptionDrafts(jobData, platform) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: systemPrompt(platform),
    messages: [{ role: 'user', content: describeJob(jobData) }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  const text = textBlock?.text ?? '';
  return splitVariants(text);
}
