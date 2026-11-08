import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isAccountActive } from '@pocket/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { VERIFIED_KEY, type VerifiedLevel } from '../decorators/verified.decorator';
import type { AuthUser } from '../types/auth';

const MESSAGES = {
  not_submitted: 'Primero completa los datos de tu cuenta',
  pending: 'Primero verifica tu identidad',
  rejected: 'Completa de nuevo los datos de tu cuenta',
} as const;

@Injectable()
export class VerifiedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<VerifiedLevel | undefined>(
      VERIFIED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const authUser = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!authUser) throw new ForbiddenException('Inicia sesión primero');

    const user = await this.prisma.user.findUnique({
      where: { id: authUser.sub },
      select: { role: true, verificationStatus: true },
    });
    if (!user) throw new ForbiddenException('No encontramos al usuario');
    if (user.verificationStatus === 'approved') return true;
    if (required === 'active' && isAccountActive(user)) return true;
    throw new ForbiddenException(MESSAGES[user.verificationStatus]);
  }
}
