import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { products } from '../src/database/schema/index';
import { registerTenant } from './helpers/register-tenant';

/**
 * Regression test for the critical finding from the 2026-08-17 security
 * review: the API's runtime connection was running with a SUPERUSER role
 * (implicit BYPASSRLS), so ALL RLS policies were being ignored — tenant
 * isolation relied entirely on the `WHERE tenant_id = ...` filters written by
 * hand in each service, with no safety net at all in the database.
 *
 * This test doesn't go through the API/services (which already filter
 * correctly) — it proves the protection at the database connection level:
 * even a "forgotten" query with no tenant filter must come back empty,
 * because the runtime role (`pcaarb_app`, migration 0011) has no privilege
 * to bypass RLS.
 */
describe('Segurança do banco — privilégio da role de runtime (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get(DRIZZLE);
  });

  afterAll(async () => {
    await app.close();
  });

  it('a role de runtime da API não é superuser nem tem BYPASSRLS', async () => {
    const result = await db.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
      sql`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    const [role] = result.rows;
    expect(role?.rolsuper).toBe(false);
    expect(role?.rolbypassrls).toBe(false);
  });

  it('uma query direta sem contexto de tenant não vaza dados entre tenants (RLS de verdade, não só filtro de app)', async () => {
    const tenantA = await registerTenant(app, 'dbsec-a');
    const tenantB = await registerTenant(app, 'dbsec-b');

    await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ name: 'Produto do tenant A', priceCents: 100 });
    await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .send({ name: 'Produto do tenant B', priceCents: 100 });

    // Raw query, straight on the API connection, WITHOUT going through
    // runWithTenant — simulates a "forgot the WHERE tenant_id" bug. With RLS
    // truly active for this role, this must never return a row from any
    // tenant: either it comes back empty (new connection, `app.tenant_id`
    // never set ⇒ NULL in the policy), or the query itself fails (pooled
    // connection reused, `app.tenant_id` reverted to an empty string after
    // the previous runWithTenant ended ⇒ the cast to uuid is rejected). Both
    // are fail-closed — neither leaks data.
    let rows: unknown[] = [];
    try {
      rows = await db.select().from(products);
    } catch {
      rows = [];
    }
    expect(rows).toHaveLength(0);
  });
});
