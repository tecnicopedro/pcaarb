import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { registerTenant } from './helpers/register-tenant';
import { openCashSession } from './helpers/open-cash-session';

// Cobre a base de idempotência para o PDV offline (ver
// pcaarb_mobile_pdv_decision): clientSaleId é a chave que vai deixar o
// service worker reenviar a mesma venda enfileirada sem risco de vender
// duas vezes. Não é o fluxo offline completo (isso ainda não existe no
// frontend), é só o alicerce no backend — testado direto contra o mesmo
// endpoint POST /sales que o PDV online já usa.
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
    expect(product.stockQuantity).toBe(8); // 10 - 2, não 10 - 4
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

    // Uma venda NOVA (sem essa clientSaleId) seria bloqueada por falta de
    // caixa aberto — confirma que o bloqueio de fato existe neste cenário...
    const freshSale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 500 }] });
    expect(freshSale.status).toBe(400);

    // ...mas o replay da venda que JÁ tinha sido concluída não é uma venda
    // nova — é o mesmo retry de sincronização batendo de novo, então precisa
    // devolver a venda existente em vez de exigir caixa aberto de novo.
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
    expect(product.stockQuantity).toBe(7); // 10 - 3, uma única vez
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
