/**
 * What a call costs, from the tokens the API reports. USD per million tokens,
 * from Anthropic's price list for each model. A model missing here has no
 * known price, so the assistant refuses to run on it rather than spend blind.
 */
interface Rates {
  input: number;
  output: number;
  /** Reading a cached prompt prefix: a tenth of the input rate. */
  cacheRead: number;
  /** Writing the prefix to the 5-minute cache: 1.25 times the input rate. */
  cacheWrite: number;
}

interface PriceCard {
  standard: Rates;
  /** Prompts above `longContextFrom` input tokens are billed at this card. */
  longContext?: Rates;
  longContextFrom?: number;
}

const PRICES: Record<string, PriceCard> = {
  'claude-haiku-5-5': {
    standard: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
    longContext: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
    longContextFrom: 100_000,
  },
};

/** The token counts of one response, as the API's `usage` reports them. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function hasPrice(model: string): boolean {
  return model in PRICES;
}

/** Cost in USD of one call, rounded to the millionth the table stores. */
export function costUsd(model: string, usage: TokenUsage): number {
  const card = PRICES[model];
  if (!card) throw new Error(`No price known for model ${model}`);
  const prompt = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const rates =
    card.longContext && card.longContextFrom !== undefined && prompt > card.longContextFrom
      ? card.longContext
      : card.standard;
  const cost =
    (usage.inputTokens * rates.input +
      usage.outputTokens * rates.output +
      usage.cacheReadTokens * rates.cacheRead +
      usage.cacheWriteTokens * rates.cacheWrite) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * The most a call can cost, to hold it against the month's budget before
 * asking: every input token written to the cache, and every output token the
 * call may produce.
 */
export function maxCallCostUsd(model: string, inputTokens: number, maxOutputTokens: number): number {
  return costUsd(model, {
    inputTokens: 0,
    outputTokens: maxOutputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: inputTokens,
  });
}
