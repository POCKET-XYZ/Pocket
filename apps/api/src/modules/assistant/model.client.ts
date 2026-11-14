import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hasPrice, type TokenUsage } from './pricing';

/** Output tokens a call may produce, its thinking included. */
export const MAX_OUTPUT_TOKENS = 4_000;

/** The longest a call may take, from the request to the last token. */
const CALL_TIMEOUT_MS = 30_000;

export interface ModelRequest {
  /** Fixed instructions, cached between calls. */
  system: string;
  /** What this call is about, already masked: the person's text and its context. */
  user: string;
  /** The JSON schema the answer must follow. */
  schema: Record<string, unknown>;
  /** Called with the answer's text so far, as it is written. */
  onText?: (snapshot: string) => void;
}

export type ModelFailure = 'refusal' | 'truncated' | 'timeout' | 'api_error' | 'invalid_json';

export type ModelResult =
  | { ok: true; json: unknown; usage: TokenUsage; latencyMs: number }
  | { ok: false; reason: ModelFailure; usage: TokenUsage; latencyMs: number };

const NO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/**
 * The one place Pocket talks to Claude. Server side only: the web never sees
 * the key. Every call streams, asks for low effort and a fixed JSON schema,
 * and gives up after 30 seconds; the SDK retries once on a temporary error
 * (429, 5xx, a dropped connection). Refusals, cut-off answers and timeouts
 * come back as failures, never as text to show.
 */
@Injectable()
export class AssistantModel {
  private readonly logger = new Logger(AssistantModel.name);
  private readonly client: Anthropic | null;
  readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('assistant.apiKey') ?? '';
    this.model = config.get<string>('assistant.model') ?? 'claude-haiku-5-5';
    this.client = apiKey ? new Anthropic({ apiKey, maxRetries: 1, timeout: CALL_TIMEOUT_MS }) : null;
    if (apiKey && !hasPrice(this.model)) {
      this.logger.error(`No price known for ${this.model}: the assistant stays off`);
    }
  }

  /** A key is set and the model's price is known, so spend can be counted. */
  get usable(): boolean {
    return this.client !== null && hasPrice(this.model);
  }

  async generate(request: ModelRequest): Promise<ModelResult> {
    const started = Date.now();
    const elapsed = () => Date.now() - started;
    if (!this.client) return { ok: false, reason: 'api_error', usage: NO_USAGE, latencyMs: 0 };
    try {
      const stream = this.client.messages.stream(
        {
          model: this.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: request.schema },
          },
          system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: request.user }],
        },
        { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) },
      );
      if (request.onText) {
        const onText = request.onText;
        stream.on('text', (_delta, snapshot) => onText(snapshot));
      }
      const message = await stream.finalMessage();
      const usage = usageOf(message.usage);
      if (message.stop_reason === 'refusal') {
        this.logger.warn(`Refused: ${message.stop_details?.category ?? 'no category'}`);
        return { ok: false, reason: 'refusal', usage, latencyMs: elapsed() };
      }
      if (message.stop_reason === 'max_tokens') {
        return { ok: false, reason: 'truncated', usage, latencyMs: elapsed() };
      }
      // A response can start with thinking blocks: read the text by type.
      const text = message.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');
      try {
        return { ok: true, json: JSON.parse(text), usage, latencyMs: elapsed() };
      } catch {
        return { ok: false, reason: 'invalid_json', usage, latencyMs: elapsed() };
      }
    } catch (error) {
      const timedOut =
        error instanceof Anthropic.APIUserAbortError ||
        error instanceof Anthropic.APIConnectionTimeoutError ||
        (error instanceof Error && error.name === 'TimeoutError');
      // The status and type only: an error body never reaches the logs.
      const detail = error instanceof Anthropic.APIError ? `HTTP ${error.status ?? '-'}` : (error as Error).name;
      this.logger.warn(`Call failed (${timedOut ? 'timeout' : detail})`);
      return { ok: false, reason: timedOut ? 'timeout' : 'api_error', usage: NO_USAGE, latencyMs: elapsed() };
    }
  }
}

function usageOf(usage: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}
