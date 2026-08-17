import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { tenants } from '../src/database/schema/index';
import { TrialExpiryService } from '../src/modules/tenants/trial-expiry.service';
import { registerTenant } from './helpers/register-tenant';

describe('Expiração de trial (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let trialExpiryService: TrialExpiryService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get(DRIZZLE);
    trialExpiryService = app.get(TrialExpiryService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('bloqueia tenants em trial vencido e não mexe nos demais', async () => {
    const expired = await registerTenant(app, 'trial-vencido');
    const withinTrial = await registerTenant(app, 'trial-em-dia');

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.update(tenants).set({ trialEndsAt: yesterday }).where(eq(tenants.id, expired.tenantId));

    const blockedCount = await trialExpiryService.expireOverdueTrials();
    expect(blockedCount).toBeGreaterThanOrEqual(1);

    const [expiredTenant] = await db.select().from(tenants).where(eq(tenants.id, expired.tenantId));
    expect(expiredTenant?.status).toBe('blocked');

    const [activeTenant] = await db.select().from(tenants).where(eq(tenants.id, withinTrial.tenantId));
    expect(activeTenant?.status).toBe('trial');

    // Rodar de novo não deve remachucar quem já foi bloqueado nem afetar quem está em dia.
    await trialExpiryService.expireOverdueTrials();
    const [stillActiveTenant] = await db.select().from(tenants).where(eq(tenants.id, withinTrial.tenantId));
    expect(stillActiveTenant?.status).toBe('trial');
  });
});
