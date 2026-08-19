import { Injectable, ForbiddenException, type CanActivate, type ExecutionContext } from '@nestjs/common';
// Value import: needed for NestJS to inject via emitDecoratorMetadata.
import { Reflector } from '@nestjs/core';
import type { JwtPayload, Role } from '@pcaarb/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Você não tem permissão para executar esta ação');
    }
    return true;
  }
}
