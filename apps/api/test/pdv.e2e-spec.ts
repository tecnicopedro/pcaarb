import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { registerTenant } from './helpers/register-tenant';

async function createProduct(app: INestApplication, accessToken: string, priceCents: number, name = 'Produto') {
  const response = await request(app.getHttpServer())
    .post('/api/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, priceCents });
  return response.body.id as string;
}

describe('PDV (e2e)', () => {
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

  it('bloqueia venda sem caixa aberto e libera depois de abrir', async () => {
    const tenant = await registerTenant(app, 'pdv-fluxo');
    const productId = await createProduct(app, tenant.accessToken, 899);

    const beforeOpen = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 899 }] });
    expect(beforeOpen.status).toBe(400);
    expect(beforeOpen.body.message).toMatch(/abra o caixa/i);

    const open = await request(app.getHttpServer())
      .post('/api/cash-sessions')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ openingAmountCents: 10_000 });
    expect(open.status).toBe(201);

    const reopen = await request(app.getHttpServer())
      .post('/api/cash-sessions')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ openingAmountCents: 10_000 });
    expect(reopen.status).toBe(409);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 899 }] });
    expect(sale.status).toBe(201);
    expect(sale.body.totalCents).toBe(899);
    expect(sale.body.cashSessionId).toBe(open.body.id);
  });

  it('venda com múltiplos itens, desconto e pagamento dividido soma corretamente', async () => {
    const tenant = await registerTenant(app, 'pdv-split');
    const productA = await createProduct(app, tenant.accessToken, 899, 'Produto A');
    const productB = await createProduct(app, tenant.accessToken, 350, 'Produto B');

    await request(app.getHttpServer())
      .post('/api/cash-sessions')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ openingAmountCents: 0 });

    // 2×899 + 3×350 = 2848; desconto 50 => total 2798
    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        items: [
          { productId: productA, quantity: 2 },
          { productId: productB, quantity: 3 },
        ],
        discountCents: 50,
        payments: [
          { method: 'dinheiro', amountCents: 1798 },
          { method: 'pix', amountCents: 1000 },
        ],
      });

    expect(sale.status).toBe(201);
    expect(sale.body.subtotalCents).toBe(2848);
    expect(sale.body.totalCents).toBe(2798);
    expect(sale.body.items).toHaveLength(2);
    expect(sale.body.payments).toHaveLength(2);
  });

  it('rejeita venda quando os pagamentos não fecham com o total', async () => {
    const tenant = await registerTenant(app, 'pdv-pagamento-errado');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await request(app.getHttpServer())
      .post('/api/cash-sessions')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ openingAmountCents: 0 });

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 500 }] });

    expect(sale.status).toBe(400);
    expect(sale.body.message).toMatch(/pagamentos somam/i);
  });

  it('rejeita venda de produto inativo', async () => {
    const tenant = await registerTenant(app, 'pdv-inativo');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await request(app.getHttpServer())
      .patch(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ active: false });
    await request(app.getHttpServer())
      .post('/api/cash-sessions')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ openingAmountCents: 0 });

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });

    expect(sale.status).toBe(400);
    expect(sale.body.message).toMatch(/inativo/i);
  });

  it('sangria e suprimento ficam registrados, e caixa fechado bloqueia nova venda', async () => {
    const tenant = await registerTenant(app, 'pdv-caixa');
    const productId = await createProduct(app, tenant.accessToken, 500);
    const open = await request(app.getHttpServer())
      .post('/api/cash-sessions')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ openingAmountCents: 10_000 });
    const sessionId = open.body.id as string;

    const sangria = await request(app.getHttpServer())
      .post(`/api/cash-sessions/${sessionId}/movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'sangria', amountCents: 2000, reason: 'Troco para o banco' });
    expect(sangria.status).toBe(201);

    const suprimento = await request(app.getHttpServer())
      .post(`/api/cash-sessions/${sessionId}/movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'suprimento', amountCents: 5000 });
    expect(suprimento.status).toBe(201);

    const movements = await request(app.getHttpServer())
      .get(`/api/cash-sessions/${sessionId}/movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(movements.body).toHaveLength(2);

    const close = await request(app.getHttpServer())
      .post(`/api/cash-sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ closingAmountCents: 13_000 });
    expect(close.status).toBe(201);
    expect(close.body.status).toBe('closed');

    const movementAfterClose = await request(app.getHttpServer())
      .post(`/api/cash-sessions/${sessionId}/movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'sangria', amountCents: 100 });
    expect(movementAfterClose.status).toBe(409);

    const saleAfterClose = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 500 }] });
    expect(saleAfterClose.status).toBe(400);
  });
});
