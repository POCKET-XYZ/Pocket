import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../types/auth';

/** Runs after JwtAuthGuard. Routes without @Roles() are open to any signed-in user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) {
      // An account that is a startup and an expert, acting as the other one:
      // say how to do it instead of only no.
      const other = user?.roles?.find((role) => roles.includes(role));
      if (other === 'startup' || other === 'specialist') {
        throw new ForbiddenException(
          other === 'specialist'
            ? 'Estás usando Pocket como empresa. Cambia a experto desde el menú de tu cuenta para hacer esto'
            : 'Estás usando Pocket como experto. Cambia a tu empresa desde el menú de tu cuenta para hacer esto',
        );
      }
      throw new ForbiddenException('Tu rol no permite esta acción');
    }
    return true;
  }
}
