import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, lt, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { tenants } from '../../database/schema/index';

/**
 * TenantStatusGuard already blocks tenants with an expired trial in real
 * time (comparing `trialEndsAt` on every request), so this isn't the actual
 * access barrier — it just keeps `tenants.status` faithful to reality in the
 * database, for reporting/admin and for any future flow that depends on the
 * persisted status instead of recalculating it on every read.
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
