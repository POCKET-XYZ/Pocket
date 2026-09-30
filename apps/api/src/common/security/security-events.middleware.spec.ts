import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import * as log from './security-log';
import { securityEventsMiddleware } from './security-events.middleware';

function run(status: number, url = '/api/contracts/abc?token=secret') {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  const req = { method: 'POST', originalUrl: url, ip: '203.0.113.9', user: { sub: 'user-1' } };
  const next = jest.fn() as NextFunction;
  securityEventsMiddleware(req as unknown as Request, res as unknown as Response, next);
  res.statusCode = status;
  res.emit('finish');
  expect(next).toHaveBeenCalled();
}

describe('securityEventsMiddleware', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(log, 'securityEvent').mockImplementation(() => undefined);
  });
  afterEach(() => spy.mockRestore());

  it.each([
    [401, 'denied'],
    [403, 'denied'],
    [429, 'rate_limited'],
  ])('records a %s as %s, without the query string', (status, event) => {
    run(status);
    expect(spy).toHaveBeenCalledWith(
      event,
      {
        status,
        method: 'POST',
        path: '/api/contracts/abc',
        ip: '203.0.113.9',
        userId: 'user-1',
      },
      'warn',
    );
  });

  it('ignores answers that are not refusals', () => {
    for (const status of [200, 201, 400, 404, 500]) run(status);
    expect(spy).not.toHaveBeenCalled();
  });
});
