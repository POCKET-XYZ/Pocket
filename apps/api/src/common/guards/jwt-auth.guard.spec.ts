import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../types/auth';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'a-test-secret-that-is-long-enough-000';
const OPTIONS = { issuer: 'pocket-api', audience: 'pocket-web' };
const signer = new JwtService({
  secret: SECRET,
  signOptions: { algorithm: 'HS256', expiresIn: '1h', ...OPTIONS },
  verifyOptions: { algorithms: ['HS256'], ...OPTIONS },
});
const USER = { role: 'specialist', stellarAddress: 'GUSER', tokenVersion: 3 };

function context(authorization?: string, isPublic = false) {
  const request: { headers: Record<string, string>; user?: AuthUser } = {
    headers: authorization ? { authorization } : {},
  };
  const handler = () => undefined;
  if (isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  const ctx = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

/** A token signed with the claims given, the way an attacker could forge one. */
function token(claims: Record<string, unknown>, secret = SECRET, options = OPTIONS) {
  return new JwtService({ secret }).sign(claims, { algorithm: 'HS256', ...options });
}

describe('JwtAuthGuard', () => {
  let prisma: { user: { findUnique: jest.Mock } };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn().mockResolvedValue(USER) } };
    guard = new JwtAuthGuard(signer, new Reflector(), prisma as unknown as PrismaService);
  });

  const valid = () =>
    token({ sub: 'user-1', role: 'specialist', stellarAddress: 'GUSER', ver: 3 });

  it('lets a public route through without a token', async () => {
    await expect(guard.canActivate(context(undefined, true).ctx)).resolves.toBe(true);
  });

  it('attaches the user of a valid token', async () => {
    const { ctx, request } = context(`Bearer ${valid()}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual({ sub: 'user-1', role: 'specialist', stellarAddress: 'GUSER' });
  });

  it('takes the role from the database, not from the token', async () => {
    const forged = token({ sub: 'user-1', role: 'manager', stellarAddress: 'GUSER', ver: 3 });
    const { ctx, request } = context(`Bearer ${forged}`);
    await guard.canActivate(ctx);
    expect(request.user?.role).toBe('specialist');
  });

  it.each([
    ['no token', undefined],
    ['another scheme', `Basic ${Buffer.from('a:b').toString('base64')}`],
    ['garbage', 'Bearer not-a-token'],
  ])('refuses %s', async (_label, header) => {
    await expect(guard.canActivate(context(header).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a token signed with another secret', async () => {
    const forged = token({ sub: 'user-1', ver: 3 }, 'another-secret-that-is-long-enough-00');
    await expect(guard.canActivate(context(`Bearer ${forged}`).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses an unsigned token (alg none)', async () => {
    const encode = (part: object) => Buffer.from(JSON.stringify(part)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      sub: 'user-1',
      role: 'manager',
      ver: 3,
      ...OPTIONS,
      aud: OPTIONS.audience,
      iss: OPTIONS.issuer,
    })}.`;
    await expect(guard.canActivate(context(`Bearer ${unsigned}`).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a token from another issuer or for another audience', async () => {
    const otherIssuer = token({ sub: 'user-1', ver: 3 }, SECRET, {
      issuer: 'someone-else',
      audience: OPTIONS.audience,
    });
    const otherAudience = token({ sub: 'user-1', ver: 3 }, SECRET, {
      issuer: OPTIONS.issuer,
      audience: 'another-app',
    });
    for (const forged of [otherIssuer, otherAudience]) {
      await expect(guard.canActivate(context(`Bearer ${forged}`).ctx)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('refuses a token from a session that was signed out', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...USER, tokenVersion: 4 });
    await expect(guard.canActivate(context(`Bearer ${valid()}`).ctx)).rejects.toThrow(
      'session ended',
    );
  });

  it('refuses a token of a user that no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(context(`Bearer ${valid()}`).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
