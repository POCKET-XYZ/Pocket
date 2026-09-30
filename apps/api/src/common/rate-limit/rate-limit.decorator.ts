import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitRule {
  /**
   * Routes with the same bucket share one budget per caller, so a login that
   * takes a challenge and a sign-in counts both against `auth`.
   */
  bucket: string;
  limit: number;
  windowSeconds: number;
}

/**
 * A tighter limit than the global one, for routes that are expensive or that
 * spend a shared budget: logins, and anything that calls Trustless Work.
 */
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT_KEY, rule);

/** Every route that reaches Trustless Work, whose 50 requests a minute everyone shares. */
export const ESCROW_RATE_LIMIT: RateLimitRule = { bucket: 'escrow', limit: 12, windowSeconds: 60 };

/** Sign-in routes: each call writes a challenge or asks Pollar to check a session. */
export const AUTH_RATE_LIMIT: RateLimitRule = { bucket: 'auth', limit: 20, windowSeconds: 60 };
