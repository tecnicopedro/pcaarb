import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import type { Env } from '../src/config/env.validation';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { registerTenant } from './helpers/register-tenant';
import { openCashSession } from './helpers/open-cash-session';

async function mintUser(app: INestApplication, db: Database, tenantId: string, role: 'admin' | 'financeiro' | 'operador_caixa') {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
  const passwordHash = await bcrypt.hash('SenhaForte123', 12);
  const [user] = await db.insert(users).values({ tenantId, name: role, email, passwordHash, role }).returning();
  const jwtService = app.get(JwtService);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const accessToken = await jwtService.signAsync(
    { sub: user!.id, tenantId, role },
    { secret: config.get('JWT_ACCESS_SECRET', { infer: true }), expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }) },
  );
  return { id: user!.id, accessToken };
}

async function createProduct(app: INestApplication, accessToken: string, priceCents: number, name = 'Produto') {
  const response = await request(app.getHttpServer())
    .post('/api/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, priceCents, trackStock: false });
  return response.body.id as string;
}

async function subscribeToPlan(app: INestApplication, accessToken: string, plan: string) {
  return request(app.getHttpServer()).post('/api/billing/subscribe').set('Authorization', `Bearer ${accessToken}`).send({ plan });
}

describe('Lojas / multi-loja (e2e)', () => {
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

  it('tenant novo já nasce com uma loja ativa, nomeada como a empresa', async () => {
    const tenant = await registerTenant(app, 'lojas-default');
    const list = await request(app.getHttpServer()).get('/api/stores').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].active).toBe(true);
    expect(list.body[0].name).toBe('Loja lojas-default');
  });

  it('criar uma 2ª loja sem plano Multi-loja é rejeitado', async () => {
    const tenant = await registerTenant(app, 'lojas-sem-plano');
    const create = await request(app.getHttpServer())
      .post('/api/stores')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ name: 'Filial Centro' });
    expect(create.status).toBe(403);
    expect(create.body.message).toMatch(/multi-loja/i);
  });

  it('assinando o plano Multi-loja, criar a 2ª loja funciona', async () => {
    const tenant = await registerTenant(app, 'lojas-com-plano');
    const subscribe = await subscribeToPlan(app, tenant.accessToken, 'multi_loja');
    expect(subscribe.status).toBe(201);

    const create = await request(app.getHttpServer())
      .post('/api/stores')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ name: 'Filial Centro' });
    expect(create.status).toBe(201);
    expect(create.body.name).toBe('Filial Centro');

    const list = await request(app.getHttpServer()).get('/api/stores').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(list.body).toHaveLength(2);
  });

  it('admin gerencia lojas; financeiro e operador de caixa só leem', async () => {
    const tenant = await registerTenant(app, 'lojas-rbac');
    const admin = await mintUser(app, db, tenant.tenantId, 'admin');
    const financeiro = await mintUser(app, db, tenant.tenantId, 'financeiro');
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');
    await subscribeToPlan(app, tenant.accessToken, 'multi_loja');

    const adminCreates = await request(app.getHttpServer())
      .post('/api/stores')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Filial Admin' });
    expect(adminCreates.status).toBe(201);

    const financeiroCreates = await request(app.getHttpServer())
      .post('/api/stores')
      .set('Authorization', `Bearer ${financeiro.accessToken}`)
      .send({ name: 'Filial Financeiro' });
    expect(financeiroCreates.status).toBe(403);

    const cashierReads = await request(app.getHttpServer()).get('/api/stores').set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(cashierReads.status).toBe(200);
  });

  it('não permite desativar a única loja ativa do tenant', async () => {
    const tenant = await registerTenant(app, 'lojas-unica-ativa');
    const list = await request(app.getHttpServer()).get('/api/stores').set('Authorization', `Bearer ${tenant.accessToken}`);
    const storeId = list.body[0].id as string;

    const deactivate = await request(app.getHttpServer())
      .patch(`/api/stores/${storeId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ active: false });
    expect(deactivate.status).toBe(400);
  });

  it('caixa aberto numa loja inativa é rejeitado; venda herda a loja do caixa', async () => {
    const tenant = await registerTenant(app, 'lojas-venda');
    await subscribeToPlan(app, tenant.accessToken, 'multi_loja');
    const secondStore = await request(app.getHttpServer())
      .post('/api/stores')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ name: 'Filial Nova' });
    const secondStoreId = secondStore.body.id as string;

    await request(app.getHttpServer())
      .patch(`/api/stores/${secondStoreId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ active: false });

    const openInactive = await request(app.getHttpServer())
      .post('/api/cash-sessions')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ storeId: secondStoreId, openingAmountCents: 0 });
    expect(openInactive.status).toBe(400);

    const productId = await createProduct(app, tenant.accessToken, 1000);
    const open = await openCashSession(app, tenant.accessToken);
    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });
    expect(sale.status).toBe(201);
    expect(sale.body.storeId).toBe(open.body.storeId);
  });

  it('relatório consolidado agrega vendas por loja corretamente', async () => {
    const tenant = await registerTenant(app, 'lojas-relatorio');
    await subscribeToPlan(app, tenant.accessToken, 'multi_loja');
    const secondStore = await request(app.getHttpServer())
      .post('/api/stores')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ name: 'Filial Relatório' });
    const secondStoreId = secondStore.body.id as string;

    const list = await request(app.getHttpServer()).get('/api/stores').set('Authorization', `Bearer ${tenant.accessToken}`);
    const firstStoreId = (list.body as Array<{ id: string }>).find((store) => store.id !== secondStoreId)!.id;

    const productId = await createProduct(app, tenant.accessToken, 1000);

    // One sale at the default store, then closes the register (only one open
    // register per operator at a time) and opens another at the 2nd store with another sale.
    await request(app.getHttpServer())
      .post('/api/cash-sessions')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ storeId: firstStoreId, openingAmountCents: 0 });
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });

    const currentSession = await request(app.getHttpServer())
      .get('/api/cash-sessions/current')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    await request(app.getHttpServer())
      .post(`/api/cash-sessions/${currentSession.body.id}/close`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ closingAmountCents: 1000 });

    await request(app.getHttpServer())
      .post('/api/cash-sessions')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ storeId: secondStoreId, openingAmountCents: 0 });
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 2 }], payments: [{ method: 'dinheiro', amountCents: 2000 }] });

    const report = await request(app.getHttpServer())
      .get('/api/reports/lojas-ranking')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(report.status).toBe(200);
    expect(report.body).toHaveLength(2);
    const bySecondStore = report.body.find((item: { storeId: string }) => item.storeId === secondStoreId);
    expect(bySecondStore.totalSales).toBe(1);
    expect(bySecondStore.revenueCents).toBe(2000);
    const byFirstStore = report.body.find((item: { storeId: string }) => item.storeId === firstStoreId);
    expect(byFirstStore.totalSales).toBe(1);
    expect(byFirstStore.revenueCents).toBe(1000);
  });

  it('downgrade bloqueia caixa em loja extra na hora de usar, não só na hora de criar (fecha o buraco de upgrade->criar loja->downgrade de graça)', async () => {
    const tenant = await registerTenant(app, 'lojas-downgrade');
    await subscribeToPlan(app, tenant.accessToken, 'multi_loja');
    const secondStore = await request(app.getHttpServer())
      .post('/api/stores')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ name: 'Filial Temporária' });
    const secondStoreId = secondStore.body.id as string;

    // Downgrade back to Starter — the extra store still exists (it's not
    // deleted), but it can no longer be used to open a register.
    await subscribeToPlan(app, tenant.accessToken, 'starter');

    const openOnExtraStore = await request(app.getHttpServer())
      .post('/api/cash-sessions')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ storeId: secondStoreId, openingAmountCents: 0 });
    expect(openOnExtraStore.status).toBe(403);
    expect(openOnExtraStore.body.message).toMatch(/multi-loja|plano atual/i);

    const list = await request(app.getHttpServer()).get('/api/stores').set('Authorization', `Bearer ${tenant.accessToken}`);
    const firstStoreId = (list.body as Array<{ id: string }>).find((store) => store.id !== secondStoreId)!.id;
    const openOnDefaultStore = await request(app.getHttpServer())
      .post('/api/cash-sessions')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ storeId: firstStoreId, openingAmountCents: 0 });
    expect(openOnDefaultStore.status).toBe(201); // the original (default) store is never blocked, on any plan
  });

  it('isola lojas entre tenants diferentes (RLS)', async () => {
    const tenantA = await registerTenant(app, 'lojas-iso-a');
    const tenantB = await registerTenant(app, 'lojas-iso-b');

    const listA = await request(app.getHttpServer()).get('/api/stores').set('Authorization', `Bearer ${tenantA.accessToken}`);
    const storeIdA = listA.body[0].id as string;

    const crossTenantUpdate = await request(app.getHttpServer())
      .patch(`/api/stores/${storeIdA}`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .send({ name: 'Hackeada' });
    expect(crossTenantUpdate.status).toBe(404);

    const listB = await request(app.getHttpServer()).get('/api/stores').set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(listB.body).toHaveLength(1);
    expect(listB.body[0].id).not.toBe(storeIdA);
  });
});
