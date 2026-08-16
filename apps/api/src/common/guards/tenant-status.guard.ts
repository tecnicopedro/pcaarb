import { ForbiddenException, Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { JwtPayload } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { tenants } from '../../database/schema/index';

/**
 * Bloqueia o acesso de tenants inadimplentes/expirados na borda da aplicação,
 * antes de qualquer regra de negócio rodar. Critério de saída da Fase 0 do roadmap.
 */
@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user) {
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
