import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY, type RateLimitRule } from '../rate-limit/rate-limit.decorator';
import { RateLimiter } from '../rate-limit/rate-limiter';
import { GLOBAL_RATE_LIMIT, RateLimitGuard } from './rate-limit.guard';

/** A request as the guard sees it, after authentication. */
function context(options: { ip?: string; userId?: string; rule?: RateLimitRule }) {
  const headers: Record<string, string> = {};
  const handler = () => undefined;
  if (options.rule) Reflect.defineMetadata(RATE_LIMIT_KEY, options.rule, handler);
  const ctx = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({
        ip: options.ip ?? '10.0.0.1',
        user: options.userId ? { sub: options.userId } : undefined,
      }),
      getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }),
    }),
  } as unknown as ExecutionContext;
  return { ctx, headers };
}

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;

  beforeEach(() => {
    guard = new RateLimitGuard(new Reflector(), new RateLimiter());
  });

  const status = (fn: () => unknown) => {
    try {
      fn();
      return 200;
    } catch (error) {
      return (error as HttpException).getStatus();
    }
  };

  it('answers 429 with Retry-After once a route bucket is spent', () => {
    const rule = { bucket: 'auth', limit: 2, windowSeconds: 60 };
    const statuses = [1, 2, 3].map(() => {
      const { ctx } = context({ rule });
      return status(() => guard.canActivate(ctx));
    });
    expect(statuses).toEqual([200, 200, 429]);
    const { ctx, headers } = context({ rule });
    expect(status(() => guard.canActivate(ctx))).toBe(429);
    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('counts a signed-in user by account, not by the IP they share', () => {
    const rule = { bucket: 'escrow', limit: 1, windowSeconds: 60 };
    expect(status(() => guard.canActivate(context({ rule, userId: 'a' }).ctx))).toBe(200);
    // Same office IP, another user: their own budget.
    expect(status(() => guard.canActivate(context({ rule, userId: 'b' }).ctx))).toBe(200);
    expect(status(() => guard.canActivate(context({ rule, userId: 'a' }).ctx))).toBe(429);
  });

  it('counts anonymous callers by IP', () => {
    const rule = { bucket: 'auth', limit: 1, windowSeconds: 60 };
    expect(status(() => guard.canActivate(context({ rule, ip: '1.1.1.1' }).ctx))).toBe(200);
    expect(status(() => guard.canActivate(context({ rule, ip: '2.2.2.2' }).ctx))).toBe(200);
    expect(status(() => guard.canActivate(context({ rule, ip: '1.1.1.1' }).ctx))).toBe(429);
  });

  it('applies the global limit to routes without a rule of their own', () => {
    let last = 200;
    for (let i = 0; i <= GLOBAL_RATE_LIMIT.limit; i++) {
      last = status(() => guard.canActivate(context({ userId: 'busy' }).ctx));
    }
    expect(last).toBe(429);
  });
});
