/*
 * A7 Voice Editor, and the draft -> validate -> revise loop every outbound
 * message goes through.
 */
import type { AgentConfig } from './config.ts';
import { voiceGuide } from './config.ts';
import type { AgentContext } from './llm.ts';
import { askModel, isObject, stringArray, UNTRUSTED_RULE } from './llm.ts';
import { screenMessage, words } from './rules.ts';
import type { AgentId, Channel, VoiceResult } from './types.ts';

/** The checks that need no model: banned phrases, length, hashtags, shouting. */
export function checkVoiceRules(text: string, channel: Channel, config: AgentConfig): VoiceResult {
  const notes: string[] = [];
  const lower = text.toLowerCase();
  for (const phrase of config.voice.blocklist) {
    if (lower.includes(phrase)) notes.push(`Drop the corporate phrase "${phrase}".`);
  }
  const limit = config.voice.maxWords[channel];
  if (limit && words(text) > limit) notes.push(`Too long for ${channel}: ${words(text)} words, keep it under ${limit}.`);
  if ((channel === 'nextdoor' || channel === 'instagram') && /#\w/.test(text)) notes.push('No hashtags.');
  if ((text.match(/!/g) ?? []).length > 1) notes.push('Use at most one exclamation mark.');
  if (/\b[A-Z]{4,}\b/.test(text.replace(/\b(BHS|USA|ASAP)\b/g, ''))) notes.push('No all-caps words.');
  if (channel === 'groupme' && text.split('\n').filter((line) => line.trim()).length > 3) notes.push('GroupMe posts should be 3 lines at most.');
  return { pass: notes.length === 0, scores: {}, fixNotes: notes };
}

const RUBRIC = ['friendly', 'casual', 'local', 'student_peer', 'channel_fit', 'truthful'] as const;

const RUBRIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scores', 'fix_notes'],
  properties: {
    scores: {
      type: 'object',
      additionalProperties: false,
      required: [...RUBRIC],
      properties: Object.fromEntries(RUBRIC.map((key) => [key, { type: 'integer' }])),
    },
    fix_notes: { type: 'array', items: { type: 'string' } },
  },
};

const PUBLIC_CHANNELS: Channel[] = ['nextdoor', 'instagram', 'groupme', 'email'];

/**
 * Scores a draft. Rules always run; the model rubric runs on messages that
 * leave the building, when a model is configured. Pass = no rule notes and
 * every rubric score >= 4.
 */
export async function scoreVoice(
  ctx: AgentContext,
  config: AgentConfig,
  text: string,
  channel: Channel,
  facts: string,
): Promise<VoiceResult> {
  const rules = checkVoiceRules(text, channel, config);
  if (!ctx.llm || !PUBLIC_CHANNELS.includes(channel)) return rules;

  const result = await askModel(
    ctx,
    {
      agent: 'voice',
      purpose: `voice rubric (${channel})`,
      effort: 'low',
      schema: RUBRIC_SCHEMA,
      system: `You review short messages for brand voice before a human approves them.\n\n${voiceGuide(config)}\n\nScore each dimension 1-5 (5 = perfect). "truthful" means every claim is supported by the facts given. If any score is below 4, give one concrete fix note per problem. ${UNTRUSTED_RULE}`,
      prompt: `Channel: ${channel}\nFacts the message may use:\n${facts}\n\nMessage to review:\n<draft>\n${text}\n</draft>`,
    },
    (value): value is { scores: Record<string, number>; fix_notes: string[] } =>
      isObject(value) && isObject(value.scores) && RUBRIC.every((key) => typeof (value.scores as Record<string, unknown>)[key] === 'number'),
  );
  if (!result) return rules;

  const notes = [...rules.fixNotes, ...stringArray(result.fix_notes)];
  const allGood = RUBRIC.every((key) => (result.scores[key] ?? 0) >= 4);
  return { pass: rules.pass && allGood, scores: result.scores, fixNotes: notes };
}

export interface RefineInput {
  ctx: AgentContext;
  config: AgentConfig;
  agent: AgentId;
  channel: Channel;
  /** What the message may claim, for the "truthful" check. */
  facts: string;
  /** Asks the model for a draft, given fix notes from the previous round. Null = no model or it failed. */
  draftWithModel: (fixNotes: string[], previous: string) => Promise<string | null>;
  template: () => string;
}

export interface RefineResult {
  text: string;
  source: 'model' | 'template';
  revisions: number;
  voice: VoiceResult;
  problems: string[];
  flags: string[];
}

/**
 * The inner loop from the design: draft, check rules and safety, score
 * voice, send back with notes at most `maxRevisions` times, then hand to a
 * human either way. A model failure at any point drops to the template.
 */
export async function refine(input: RefineInput): Promise<RefineResult> {
  const { ctx, config, channel } = input;
  const flags: string[] = [];

  let text = await input.draftWithModel([], '');
  if (text === null) {
    text = input.template();
    ctx.log({ agent: input.agent, purpose: `template draft (${channel})`, mode: 'template', inputTokens: 0, outputTokens: 0, costUsd: 0, error: '' });
    const voice = checkVoiceRules(text, channel, config);
    const problems = screenMessage(text, channel, config);
    if (problems.length) flags.push('blocked_message');
    return { text, source: 'template', revisions: 0, voice, problems, flags: [...flags, 'template'] };
  }

  let revisions = 0;
  for (;;) {
    const problems = screenMessage(text, channel, config);
    const voice = await scoreVoice(ctx, config, text, channel, input.facts);
    if (!problems.length && voice.pass) return { text, source: 'model', revisions, voice, problems, flags };

    if (revisions >= config.maxRevisions) {
      flags.push('needs_polish');
      if (problems.length) flags.push('blocked_message');
      return { text, source: 'model', revisions, voice, problems, flags };
    }
    const next = await input.draftWithModel([...problems, ...voice.fixNotes], text);
    if (next === null) {
      // The model failed mid-loop. The last draft is still the best we have.
      flags.push('needs_polish');
      if (problems.length) flags.push('blocked_message');
      return { text, source: 'model', revisions, voice, problems, flags };
    }
    text = next;
    revisions++;
  }
}

/** The standard drafting call: a system prompt with the voice guide, the task, examples, and fix notes. */
export function draftRequest(
  ctx: AgentContext,
  config: AgentConfig,
  agent: AgentId,
  purpose: string,
  instructions: string,
  taskPrompt: string,
) {
  return async (fixNotes: string[], previous: string): Promise<string | null> => {
    const examples = ctx.examples.length
      ? `\n\nMessages the admins approved recently (match this voice, do not copy them):\n${ctx.examples
          .slice(0, 5)
          .map((e) => `<example>\n${e}\n</example>`)
          .join('\n')}`
      : '';
    const revision = fixNotes.length
      ? `\n\nYour previous draft:\n<draft>\n${previous}\n</draft>\nFix these problems:\n- ${fixNotes.join('\n- ')}`
      : '';
    const result = await askModel(
      ctx,
      {
        agent,
        purpose: fixNotes.length ? `${purpose} (revision)` : purpose,
        effort: 'medium',
        schema: { type: 'object', additionalProperties: false, required: ['message'], properties: { message: { type: 'string' } } },
        system: `You draft messages for a human admin to review and send.\n\n${voiceGuide(config)}\n\n${instructions}\n\n${UNTRUSTED_RULE}`,
        prompt: `${taskPrompt}${examples}${revision}`,
      },
      (value): value is { message: string } => isObject(value) && typeof value.message === 'string' && value.message.trim().length > 0,
    );
    return result ? result.message.trim() : null;
  };
}
