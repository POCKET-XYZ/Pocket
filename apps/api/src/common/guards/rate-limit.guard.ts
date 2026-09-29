import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RATE_LIMIT_KEY, type RateLimitRule } from '../rate-limit/rate-limit.decorator';
import { RateLimiter } from '../rate-limit/rate-limiter';
import type { AuthUser } from '../types/auth';

/** What any caller may do across the whole API. */
export const GLOBAL_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

/**
 * Global guard, after authentication: counts a signed-in user by account and
 * anyone else by IP, against the global budget and, when the route declares
 * one, against its own tighter bucket. Past the limit it answers 429 with the
 * seconds to wait.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthUser }>();
    const caller = request.user ? `user:${request.user.sub}` : `ip:${request.ip ?? 'unknown'}`;

    this.enforce(
      http.getResponse<Response>(),
      `global:${caller}`,
      GLOBAL_RATE_LIMIT.limit,
      GLOBAL_RATE_LIMIT.windowMs,
    );

    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (rule) {
      this.enforce(
        http.getResponse<Response>(),
        `${rule.bucket}:${caller}`,
        rule.limit,
        rule.windowSeconds * 1000,
      );
    }
    return true;
  }

  private enforce(response: Response, key: string, limit: number, windowMs: number): void {
    const wait = this.limiter.take(key, limit, windowMs);
    if (wait === 0) return;
    response.setHeader('Retry-After', String(wait));
    throw new HttpException(
      `Too many requests. Try again in ${wait} seconds`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
