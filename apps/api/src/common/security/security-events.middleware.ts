import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from '../types/auth';
import { securityEvent } from './security-log';

/**
 * Logs every refused request: 401 (no or bad session), 403 (not allowed) and
 * 429 (too many). A burst of them from one caller is what an attack looks like
 * from here. The path is logged without its query string.
 */
export function securityEventsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const status = res.statusCode;
    if (status !== 401 && status !== 403 && status !== 429) return;
    const user = (req as Request & { user?: AuthUser }).user;
    securityEvent(
      status === 429 ? 'rate_limited' : 'denied',
      {
        status,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        ip: req.ip,
        userId: user?.sub,
      },
      'warn',
    );
  });
  next();
}
