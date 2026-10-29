import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { VERIFIED_KEY } from '../decorators/verified.decorator';
import type { AuthUser } from '../types/auth';

const MESSAGES = {
  not_submitted: 'Primero envía tu cuenta a verificación',
  pending: 'Tu verificación todavía está en revisión',
  rejected: 'Tu verificación fue rechazada. Corrige tus datos y vuelve a enviarlos',
} as const;

@Injectable()
export class VerifiedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(VERIFIED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const authUser = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!authUser) throw new ForbiddenException('Inicia sesión primero');

    const user = await this.prisma.user.findUnique({
      where: { id: authUser.sub },
      select: { verificationStatus: true },
    });
    if (!user) throw new ForbiddenException('No encontramos al usuario');
    if (user.verificationStatus !== 'approved') {
      throw new ForbiddenException(MESSAGES[user.verificationStatus]);
    }
    return true;
  }
}
