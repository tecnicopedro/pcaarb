import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { registerTenant } from './helpers/register-tenant';
import { openCashSession } from './helpers/open-cash-session';

// Covers the idempotency foundation for the offline PDV (see
// pcaarb_mobile_pdv_decision): clientSaleId is the key that will let the
// service worker resend the same queued sale with no risk of selling it
// twice. This isn't the full offline flow (that doesn't exist in the
// frontend yet), it's just the backend groundwork — tested directly against
// the same POST /sales endpoint the online PDV already uses.
async function createProduct(app: INestApplication, accessToken: string, priceCents: number, name = 'Produto', trackStock = false) {
  const response = await request(app.getHttpServer())
    .post('/api/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, priceCents, trackStock });
  return response.body.id as string;
}

async function addStock(app: INestApplication, accessToken: string, productId: string, quantity: number) {
  return request(app.getHttpServer())
    .post(`/api/products/${productId}/stock-movements`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ type: 'entrada', quantity });
}

describe('Venda offline — idempotência por clientSaleId (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reenviar a mesma venda (mesmo clientSaleId) devolve a venda já criada, sem vender nem descontar estoque duas vezes', async () => {
    const tenant = await registerTenant(app, 'venda-offline-replay');
    const productId = await createProduct(app, tenant.accessToken, 1000, 'Produto', true);
    await addStock(app, tenant.accessToken, productId, 10);
    await openCashSession(app, tenant.accessToken);

    const clientSaleId = randomUUID();
    const body = { items: [{ productId, quantity: 2 }], payments: [{ method: 'dinheiro', amountCents: 2000 }], clientSaleId };

    const first = await request(app.getHttpServer()).post('/api/sales').set('Authorization', `Bearer ${tenant.accessToken}`).send(body);
    expect(first.status).toBe(201);

    const replay = await request(app.getHttpServer()).post('/api/sales').set('Authorization', `Bearer ${tenant.accessToken}`).send(body);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);

    const sales = await request(app.getHttpServer()).get('/api/sales').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(sales.body).toHaveLength(1);

    const products = await request(app.getHttpServer()).get('/api/products').set('Authorization', `Bearer ${tenant.accessToken}`);
    const product = products.body.find((p: { id: string }) => p.id === productId);
    expect(product.stockQuantity).toBe(8); // 10 - 2, not 10 - 4
  });

  it('replay funciona mesmo se o caixa que originou a venda já fechou entretanto (a venda já existia, não precisa de caixa aberto pra devolvê-la)', async () => {
    const tenant = await registerTenant(app, 'venda-offline-caixa-fechado');
    const productId = await createProduct(app, tenant.accessToken, 500);
    const open = await openCashSession(app, tenant.accessToken);

    const clientSaleId = randomUUID();
    const body = { items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 500 }], clientSaleId };

    const first = await request(app.getHttpServer()).post('/api/sales').set('Authorization', `Bearer ${tenant.accessToken}`).send(body);
    expect(first.status).toBe(201);

    await request(app.getHttpServer())
      .post(`/api/cash-sessions/${open.body.id}/close`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ closingAmountCents: 500 });

    // A NEW sale (without this clientSaleId) would be blocked for lack of an
    // open register — confirms the block actually exists in this scenario...
    const freshSale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 500 }] });
    expect(freshSale.status).toBe(400);

    // ...but replaying a sale that had ALREADY been completed isn't a new
    // sale — it's the same sync retry hitting again, so it needs to return
    // the existing sale instead of demanding an open register again.
    const replay = await request(app.getHttpServer()).post('/api/sales').set('Authorization', `Bearer ${tenant.accessToken}`).send(body);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
  });

  it('duas requisições concorrentes com o mesmo clientSaleId resultam numa única venda (corrida real, não sequencial)', async () => {
    const tenant = await registerTenant(app, 'venda-offline-corrida');
    const productId = await createProduct(app, tenant.accessToken, 1000, 'Produto', true);
    await addStock(app, tenant.accessToken, productId, 10);
    await openCashSession(app, tenant.accessToken);

    const clientSaleId = randomUUID();
    const body = { items: [{ productId, quantity: 3 }], payments: [{ method: 'dinheiro', amountCents: 3000 }], clientSaleId };

    const [responseA, responseB] = await Promise.all([
      request(app.getHttpServer()).post('/api/sales').set('Authorization', `Bearer ${tenant.accessToken}`).send(body),
      request(app.getHttpServer()).post('/api/sales').set('Authorization', `Bearer ${tenant.accessToken}`).send(body),
    ]);

    expect(responseA.status).toBe(201);
    expect(responseB.status).toBe(201);
    expect(responseA.body.id).toBe(responseB.body.id);

    const sales = await request(app.getHttpServer()).get('/api/sales').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(sales.body).toHaveLength(1);

    const products = await request(app.getHttpServer()).get('/api/products').set('Authorization', `Bearer ${tenant.accessToken}`);
    const product = products.body.find((p: { id: string }) => p.id === productId);
    expect(product.stockQuantity).toBe(7); // 10 - 3, only once
  });

  it('vendas diferentes sem clientSaleId nunca colidem entre si (comportamento online de sempre, inalterado)', async () => {
    const tenant = await registerTenant(app, 'venda-offline-sem-chave');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await openCashSession(app, tenant.accessToken);

    const saleOne = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });
    const saleTwo = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });

    expect(saleOne.status).toBe(201);
    expect(saleTwo.status).toBe(201);
    expect(saleOne.body.id).not.toBe(saleTwo.body.id);

    const sales = await request(app.getHttpServer()).get('/api/sales').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(sales.body).toHaveLength(2);
  });
});
