import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from '@pcaarb/shared';
import { AbilityFactory } from '../casl/ability.factory';
import { CHECK_ABILITIES_KEY, type AbilityRequirement } from '../decorators/check-abilities.decorator';

/**
 * Global and a no-op when the route doesn't use @CheckAbilities() — same
 * pattern as RolesGuard. Where used, it checks the real CASL ability (not
 * just the raw role), so a per-action/subject rule changes in one place
 * (ability.factory.ts).
 */
@Injectable()
export class AbilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirements = this.reflector.getAllAndOverride<AbilityRequirement[]>(CHECK_ABILITIES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirements || requirements.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user) {
      return false;
    }

    const ability = await this.abilityFactory.createForUser(user);
    const allowed = requirements.every((req) => ability.can(req.action, req.subject));
    if (!allowed) {
      throw new ForbiddenException('Você não tem permissão para executar esta ação');
    }
    return true;
  }
}
