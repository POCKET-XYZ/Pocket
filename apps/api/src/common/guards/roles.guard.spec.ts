import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AuthUser } from '../types/auth';
import { RolesGuard } from './roles.guard';

function guardFor(roles: string[], user: AuthUser) {
  const reflector = { getAllAndOverride: () => roles } as unknown as Reflector;
  const ctx = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return () => new RolesGuard(reflector).canActivate(ctx);
}

describe('RolesGuard', () => {
  it('lets the role through', () => {
    expect(
      guardFor(['startup'], { sub: 'u', role: 'startup', stellarAddress: 'G' })(),
    ).toBe(true);
  });

  it('tells an account acting as its other side how to do it', () => {
    const both: AuthUser = {
      sub: 'u',
      role: 'startup',
      stellarAddress: 'G',
      roles: ['startup', 'specialist'],
    };
    expect(guardFor(['specialist'], both)).toThrow('Cambia a experto');
    expect(guardFor(['startup'], { ...both, role: 'specialist' })).toThrow(
      'Cambia a tu empresa',
    );
  });

  it('just says no to an account without the role', () => {
    const run = guardFor(['manager'], {
      sub: 'u',
      role: 'startup',
      stellarAddress: 'G',
      roles: ['startup', 'specialist'],
    });
    expect(run).toThrow(ForbiddenException);
    expect(run).toThrow('Tu rol no permite esta acción');
  });
});
