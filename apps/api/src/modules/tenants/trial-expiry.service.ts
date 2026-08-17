import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, lt, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { tenants } from '../../database/schema/index';

/**
 * O TenantStatusGuard já bloqueia tenants com trial vencido em tempo real
 * (compara `trialEndsAt` a cada request), então isso não é a barreira de
 * acesso em si — é só manter `tenants.status` fiel à realidade no banco,
 * pra relatório/admin e pra qualquer fluxo futuro que dependa do status
 * persistido em vez de recalcular a cada leitura.
 */
@Injectable()
export class TrialExpiryService {
  private readonly logger = new Logger(TrialExpiryService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    const count = await this.expireOverdueTrials();
    if (count > 0) {
      this.logger.log(`${count} tenant(s) bloqueado(s) por fim de trial.`);
    }
  }

  async expireOverdueTrials(): Promise<number> {
    const blocked = await this.db
      .update(tenants)
      .set({ status: 'blocked' })
      .where(and(eq(tenants.status, 'trial'), lt(tenants.trialEndsAt, sql`now()`)))
      .returning({ id: tenants.id });
    return blocked.length;
  }
}
