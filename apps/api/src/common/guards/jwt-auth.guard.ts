import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { OPTIONAL_USER_KEY } from '../decorators/optional-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser, JwtPayload } from '../types/auth';

/**
 * Global guard: every route needs a valid bearer token unless marked @Public().
 * A valid signature is not enough: the user must still exist, the token must
 * belong to their current session, and the role is read from the database, so
 * a demoted manager or a signed-out session stops working at once instead of
 * when the token expires. A route marked @OptionalUser() is public but still
 * gets the user of a valid token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (isPublic) {
      const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_USER_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (optional && request.headers.authorization) {
        request.user = await this.userOf(request).catch(() => undefined);
      }
      return true;
    }

    request.user = await this.userOf(request);
    return true;
  }

  /** The user of the request's bearer token, or an error saying what is wrong with it. */
  private async userOf(request: Request): Promise<AuthUser> {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Falta el token de acceso');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('El token no es válido o venció');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, stellarAddress: true, tokenVersion: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Tu sesión terminó. Inicia sesión de nuevo');
    }
    return { sub: payload.sub, role: user.role, stellarAddress: user.stellarAddress };
  }
}
