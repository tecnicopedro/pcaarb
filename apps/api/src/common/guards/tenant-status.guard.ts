import { ForbiddenException, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
// Reflector needs to be a value import — same reason as JwtAuthGuard.
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { JwtPayload } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { tenants } from '../../database/schema/index';
import { BYPASS_TENANT_STATUS_KEY } from '../decorators/bypass-tenant-status.decorator';

/**
 * Blocks access for delinquent/expired tenants at the application edge,
 * before any business rule runs. Phase 0 exit criterion from the roadmap.
 */
@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user) {
      return true;
    }

    const bypass = this.reflector.getAllAndOverride<boolean>(BYPASS_TENANT_STATUS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (bypass) {
      return true;
    }

    const [tenant] = await this.db
      .select({ status: tenants.status, trialEndsAt: tenants.trialEndsAt })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId))
      .limit(1);

    if (!tenant) {
      throw new ForbiddenException('Tenant não encontrado');
    }

    if (tenant.status === 'blocked' || tenant.status === 'canceled') {
      throw new ForbiddenException('Assinatura bloqueada. Regularize o pagamento para continuar.');
    }

    if (tenant.status === 'trial' && tenant.trialEndsAt && tenant.trialEndsAt < new Date()) {
      throw new ForbiddenException('Período de teste expirado. Assine um plano para continuar.');
    }

    return true;
  }
}
