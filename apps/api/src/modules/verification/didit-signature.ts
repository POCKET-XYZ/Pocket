import { createHmac, timingSafeEqual } from 'node:crypto';

/** How far a webhook may be from now, in seconds: Didit's own tolerance. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/** The headers Didit signs a webhook with, lowercased as Node receives them. */
export interface DiditWebhookHeaders {
  'x-timestamp'?: string;
  'x-signature-v2'?: string;
  'x-signature-v2-previous'?: string;
  'x-signature'?: string;
  'x-signature-previous'?: string;
}

/** Object keys sorted at every level, arrays kept in order. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/**
 * The payload as Didit signs it for X-Signature-V2: keys sorted at every
 * level, compact, Unicode unescaped. Didit also writes whole floats as
 * integers (100.0 as 100), which JSON.parse already does.
 */
export function canonicalJson(payload: unknown): string {
  return JSON.stringify(sortKeys(payload));
}

function hmacHex(secret: string, data: string | Buffer): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/** Two hex signatures compared in constant time; anything malformed is a mismatch. */
function sameSignature(expected: string, received: string | undefined): boolean {
  if (!received || !/^[0-9a-f]+$/i.test(received)) return false;
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received.toLowerCase(), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Whole seconds from now, or undefined when the value is not a timestamp. */
function secondsAway(value: unknown, nowSeconds: number): number | undefined {
  const seconds = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(seconds) ? Math.abs(nowSeconds - seconds) : undefined;
}

/**
 * Whether a webhook really comes from Didit and is recent. X-Signature-V2
 * signs the canonical payload, so it survives the body being parsed; the raw
 * body signature (X-Signature) is the fallback. The -Previous headers carry
 * the old secret's signature for a day after Didit rotates it. The body's own
 * timestamp is checked too, since it is signed and the header is not.
 */
export function isAuthenticDiditWebhook(input: {
  secret: string;
  headers: DiditWebhookHeaders;
  payload: unknown;
  rawBody?: Buffer;
  nowSeconds?: number;
}): boolean {
  const { secret, headers, payload, rawBody } = input;
  if (!secret) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  const headerAge = secondsAway(headers['x-timestamp'], now);
  if (headerAge === undefined || headerAge > WEBHOOK_TOLERANCE_SECONDS) return false;
  const bodyTimestamp = (payload as { timestamp?: unknown } | null)?.timestamp;
  if (bodyTimestamp !== undefined) {
    const bodyAge = secondsAway(bodyTimestamp, now);
    if (bodyAge === undefined || bodyAge > WEBHOOK_TOLERANCE_SECONDS) return false;
  }

  const canonical = hmacHex(secret, canonicalJson(payload));
  if (
    sameSignature(canonical, headers['x-signature-v2']) ||
    sameSignature(canonical, headers['x-signature-v2-previous'])
  ) {
    return true;
  }
  if (!rawBody) return false;
  const raw = hmacHex(secret, rawBody);
  return (
    sameSignature(raw, headers['x-signature']) ||
    sameSignature(raw, headers['x-signature-previous'])
  );
}
