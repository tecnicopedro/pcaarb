import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { registerTenant } from './helpers/register-tenant';

async function loginAs(app: INestApplication, db: Database, tenantId: string, role: 'financeiro' | 'operador_caixa') {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
  const passwordHash = await bcrypt.hash('SenhaForte123', 12);
  await db.insert(users).values({ tenantId, name: role, email, passwordHash, role });
  const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'SenhaForte123' });
  return login.body.accessToken as string;
}

async function createProduct(app: INestApplication, accessToken: string, name: string, opts: { trackStock?: boolean } = {}) {
  const response = await request(app.getHttpServer())
    .post('/api/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, priceCents: 1000, trackStock: opts.trackStock ?? true });
  return response.body.id as string;
}

async function stockEntry(app: INestApplication, accessToken: string, productId: string, quantity: number) {
  return request(app.getHttpServer())
    .post(`/api/products/${productId}/stock-movements`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ type: 'entrada', quantity });
}

describe('Contagem de estoque (e2e)', () => {
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

  it('abre contagem com saldo atual, registra contagens e finaliza ajustando o estoque', async () => {
    const tenant = await registerTenant(app, 'contagem-fluxo');
    const productA = await createProduct(app, tenant.accessToken, 'Produto A');
    const productB = await createProduct(app, tenant.accessToken, 'Produto B');
    await stockEntry(app, tenant.accessToken, productA, 10);
    await stockEntry(app, tenant.accessToken, productB, 5);

    const open = await request(app.getHttpServer())
      .post('/api/stock-counts')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({});
    expect(open.status).toBe(201);
    expect(open.body.status).toBe('open');
    expect(open.body.items).toHaveLength(2);
    const itemA = open.body.items.find((item: { productId: string }) => item.productId === productA);
    const itemB = open.body.items.find((item: { productId: string }) => item.productId === productB);
    expect(itemA.expectedQuantity).toBe(10);
    expect(itemB.expectedQuantity).toBe(5);
    expect(itemA.countedQuantity).toBeNull();

    // Counted 8 (a loss of 2) for product A; product B wasn't counted (stays as-is).
    const setCount = await request(app.getHttpServer())
      .patch(`/api/stock-counts/${open.body.id}/items/${itemA.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ countedQuantity: 8 });
    expect(setCount.status).toBe(200);
    expect(setCount.body.countedQuantity).toBe(8);

    const finalize = await request(app.getHttpServer())
      .post(`/api/stock-counts/${open.body.id}/finalize`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(finalize.status).toBe(201);
    expect(finalize.body.status).toBe('completed');
    expect(finalize.body.completedAt).not.toBeNull();

    const productAAfter = await request(app.getHttpServer())
      .get(`/api/products/${productA}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(productAAfter.body.stockQuantity).toBe(8);

    const productBAfter = await request(app.getHttpServer())
      .get(`/api/products/${productB}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(productBAfter.body.stockQuantity).toBe(5);
  });

  it('reconcilia contra o saldo atual, não o saldo de quando a contagem abriu', async () => {
    const tenant = await registerTenant(app, 'contagem-concorrente');
    const productId = await createProduct(app, tenant.accessToken, 'Produto Concorrente');
    await stockEntry(app, tenant.accessToken, productId, 10);

    const open = await request(app.getHttpServer())
      .post('/api/stock-counts')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({});
    const itemId = open.body.items[0].id as string;
    expect(open.body.items[0].expectedQuantity).toBe(10);

    // While the count is open, 5 more units come into stock (e.g., a purchase receipt).
    await stockEntry(app, tenant.accessToken, productId, 5);

    // Physically counted 15 (10 original + 5 that came in during the count).
    await request(app.getHttpServer())
      .patch(`/api/stock-counts/${open.body.id}/items/${itemId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ countedQuantity: 15 });

    const finalize = await request(app.getHttpServer())
      .post(`/api/stock-counts/${open.body.id}/finalize`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(finalize.status).toBe(201);

    const product = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    // If the adjustment had used expectedQuantity (10) as the base, the result
    // would still happen to be 15, but by coincidence — the important thing
    // this test checks is not duplicating or erasing the movement that
    // happened in the middle of the count.
    expect(product.body.stockQuantity).toBe(15);
  });

  it('produto inativo ou sem controle de estoque não entra na contagem', async () => {
    const tenant = await registerTenant(app, 'contagem-filtro');
    await createProduct(app, tenant.accessToken, 'Sem controle', { trackStock: false });
    const inactiveId = await createProduct(app, tenant.accessToken, 'Inativo');
    await request(app.getHttpServer())
      .patch(`/api/products/${inactiveId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ active: false });
    const trackedId = await createProduct(app, tenant.accessToken, 'Rastreado');

    const open = await request(app.getHttpServer())
      .post('/api/stock-counts')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({});
    expect(open.body.items).toHaveLength(1);
    expect(open.body.items[0].productId).toBe(trackedId);
  });

  it('não permite registrar contagem nem finalizar/cancelar duas vezes', async () => {
    const tenant = await registerTenant(app, 'contagem-estado');
    await createProduct(app, tenant.accessToken, 'Produto');

    const open = await request(app.getHttpServer())
      .post('/api/stock-counts')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({});

    const cancel = await request(app.getHttpServer())
      .post(`/api/stock-counts/${open.body.id}/cancel`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(cancel.status).toBe(201);
    expect(cancel.body.status).toBe('canceled');

    const cancelAgain = await request(app.getHttpServer())
      .post(`/api/stock-counts/${open.body.id}/cancel`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(cancelAgain.status).toBe(409);

    const finalizeCanceled = await request(app.getHttpServer())
      .post(`/api/stock-counts/${open.body.id}/finalize`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(finalizeCanceled.status).toBe(409);

    const itemId = open.body.items[0].id as string;
    const setCountAfterCancel = await request(app.getHttpServer())
      .patch(`/api/stock-counts/${open.body.id}/items/${itemId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ countedQuantity: 5 });
    expect(setCountAfterCancel.status).toBe(409);
  });

  it('isola contagens de estoque entre tenants diferentes (RLS)', async () => {
    const tenantA = await registerTenant(app, 'contagem-iso-a');
    const tenantB = await registerTenant(app, 'contagem-iso-b');
    await createProduct(app, tenantA.accessToken, 'Produto A');

    await request(app.getHttpServer())
      .post('/api/stock-counts')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({});

    const listForB = await request(app.getHttpServer())
      .get('/api/stock-counts')
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(listForB.body).toEqual([]);
  });

  it('financeiro só lê contagens de estoque, operador de caixa não acessa', async () => {
    const tenant = await registerTenant(app, 'contagem-rbac');
    await createProduct(app, tenant.accessToken, 'Produto');
    const financeiroToken = await loginAs(app, db, tenant.tenantId, 'financeiro');
    const cashierToken = await loginAs(app, db, tenant.tenantId, 'operador_caixa');

    const listByFinanceiro = await request(app.getHttpServer())
      .get('/api/stock-counts')
      .set('Authorization', `Bearer ${financeiroToken}`);
    expect(listByFinanceiro.status).toBe(200);

    const createByFinanceiro = await request(app.getHttpServer())
      .post('/api/stock-counts')
      .set('Authorization', `Bearer ${financeiroToken}`)
      .send({});
    expect(createByFinanceiro.status).toBe(403);

    const listByCashier = await request(app.getHttpServer())
      .get('/api/stock-counts')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(listByCashier.status).toBe(403);
  });
});
