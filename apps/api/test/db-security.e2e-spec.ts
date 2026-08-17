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
 * Regression test para o achado crítico da revisão de segurança de 2026-08-17:
 * a conexão de runtime da API rodava com uma role SUPERUSER (BYPASSRLS
 * implícito), então TODAS as policies de RLS eram ignoradas — o isolamento
 * entre tenants dependia inteiramente dos filtros `WHERE tenant_id = ...`
 * escritos à mão em cada service, sem nenhuma rede de segurança no banco.
 *
 * Este teste não passa pela API/services (que já filtram corretamente) —
 * ele prova a proteção no nível da conexão com o banco: mesmo uma query
 * "esquecida" sem filtro de tenant deve voltar vazia, porque a role de
 * runtime (`pcaarb_app`, migration 0011) não tem privilégio para ignorar RLS.
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

    // Query crua, direto na conexão da API, SEM passar por runWithTenant —
    // simula um bug de "esqueci o WHERE tenant_id". Com RLS realmente ativo
    // para essa role, isto nunca devolve linha de nenhum tenant: ou volta
    // vazio (conexão nova, `app.tenant_id` nunca setado ⇒ NULL na policy),
    // ou a própria query falha (conexão reciclada do pool, `app.tenant_id`
    // reverteu para string vazia após o fim do runWithTenant anterior ⇒
    // cast pra uuid rejeita). As duas são falha fechada — nenhuma vaza dado.
    let rows: unknown[] = [];
    try {
      rows = await db.select().from(products);
    } catch {
      rows = [];
    }
    expect(rows).toHaveLength(0);
  });
});
