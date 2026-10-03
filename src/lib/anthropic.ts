import { env } from '@/config/env';
import { logger } from '@/lib/logger';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const REQUEST_TIMEOUT_MS = 30_000;

export class AnthropicUnavailableError extends Error {}

/**
 * Calls Claude server-side. The API key never reaches the browser — this
 * is the one place it is read, and it comes only from the environment.
 * Callers get plain text back; prompt construction stays in the calling
 * service, not here, so this module has no business logic of its own.
 */
export async function generateText(prompt: string): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AnthropicUnavailableError('ANTHROPIC_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error({ status: res.status, body }, 'Anthropic API error');
      throw new AnthropicUnavailableError(`Anthropic API responded ${res.status}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = (data.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) {
      throw new AnthropicUnavailableError('Anthropic API returned no text content');
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}
