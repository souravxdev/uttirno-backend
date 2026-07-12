import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

/**
 * Thin seam around the Anthropic Messages API — raw fetch on purpose (the
 * SDK is not on the allowed dependency list) and injectable so e2e tests
 * override it with a fake.
 */
@Injectable()
export class AiClient {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async generateDrafts(prompt: string): Promise<string> {
    const apiKey = this.config.get('ANTHROPIC_API_KEY', { infer: true });
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI drafting is not configured — set ANTHROPIC_API_KEY',
      );
    }

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.get('ANTHROPIC_MODEL', { infer: true }),
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new BadGatewayException('AI provider is unreachable');
    }
    if (!response.ok) {
      throw new BadGatewayException(
        `AI provider error (status ${response.status})`,
      );
    }
    const data = (await response.json()) as AnthropicMessageResponse;
    const text = data.content?.find((c) => c.type === 'text')?.text;
    if (!text) {
      throw new BadGatewayException('AI provider returned no text');
    }
    return text;
  }
}
