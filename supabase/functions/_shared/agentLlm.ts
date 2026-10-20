/*
 * The agents' model connection: an `Llm` backed by the Claude API.
 *
 * Returns null when ANTHROPIC_API_KEY is not set, and the agents then
 * draft from templates — the whole system works without a key, it just
 * writes plainer messages.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import type { Llm } from './agents/index.ts';

export function anthropicLlm(model: string): Llm | null {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  // An edge function has a wall-clock limit; a slow call should fail over
  // to the template, not take the whole dispatcher run down with it.
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });

  return async (request) => {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      // A safety classifier can decline; "default" re-runs the request on
      // Anthropic's recommended fallback model instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: request.effort,
        format: { type: 'json_schema', schema: request.schema },
      },
      // The system prompt is the same for every call of a given purpose,
      // so it is cached; only the task-specific prompt changes.
      system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: request.prompt }],
    });

    if (response.stop_reason === 'refusal') throw new Error('The model declined this request');
    if (response.stop_reason === 'max_tokens') throw new Error('The reply was cut off');

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
    const usage = response.usage;
    return {
      data: JSON.parse(text),
      // Cache writes cost 1.25x and reads 0.1x of a normal input token.
      inputTokens: Math.round(
        usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) * 1.25 + (usage.cache_read_input_tokens ?? 0) * 0.1,
      ),
      outputTokens: usage.output_tokens,
    };
  };
}
