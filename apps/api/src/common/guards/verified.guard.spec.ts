import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VerifiedLevel } from '../decorators/verified.decorator';
import { VerifiedGuard } from './verified.guard';

function setup(level: VerifiedLevel | undefined, account: object | null) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(level) };
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(account) } };
  const guard = new VerifiedGuard(
    reflector as unknown as Reflector,
    prisma as unknown as PrismaService,
  );
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 'user-1', role: 'specialist' } }),
    }),
  } as unknown as ExecutionContext;
  return { guard, context, prisma };
}

describe('VerifiedGuard', () => {
  it('lets any route without the requirement through, without a query', async () => {
    const { guard, context, prisma } = setup(undefined, null);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['an approved startup', 'approved', 'startup', 'active'],
    ['an approved specialist', 'approved', 'specialist', 'approved'],
    [
      'a specialist before the identity check, on an active route',
      'pending',
      'specialist',
      'active',
    ],
  ] as const)('lets %s through', async (_label, verificationStatus, role, level) => {
    const { guard, context } = setup(level, { role, verificationStatus });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each([
    [
      'a specialist before the identity check, on an approved route',
      'pending',
      'specialist',
      'approved',
      'Primero verifica tu identidad',
    ],
    [
      'a startup before the identity check, on an active route',
      'pending',
      'startup',
      'active',
      'Primero verifica tu identidad',
    ],
    [
      'a specialist who never sent their details',
      'not_submitted',
      'specialist',
      'active',
      'Primero completa los datos de tu cuenta',
    ],
    [
      'a specialist turned down',
      'rejected',
      'specialist',
      'active',
      'Completa de nuevo los datos de tu cuenta',
    ],
  ] as const)('stops %s', async (_label, verificationStatus, role, level, message) => {
    const { guard, context } = setup(level, { role, verificationStatus });
    const refused = guard.canActivate(context);
    await expect(refused).rejects.toBeInstanceOf(ForbiddenException);
    await expect(refused).rejects.toThrow(message);
  });
});
