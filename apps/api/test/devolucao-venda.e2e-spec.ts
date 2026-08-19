import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { registerTenant } from './helpers/register-tenant';
import { openCashSession } from './helpers/open-cash-session';

async function createProduct(app: INestApplication, accessToken: string, priceCents: number, name = 'Produto', trackStock = true) {
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

async function createCustomer(app: INestApplication, accessToken: string, name = 'Cliente') {
  const response = await request(app.getHttpServer()).post('/api/customers').set('Authorization', `Bearer ${accessToken}`).send({ name });
  return response.body.id as string;
}

async function stockQuantity(app: INestApplication, accessToken: string, productId: string) {
  const products = await request(app.getHttpServer()).get('/api/products').set('Authorization', `Bearer ${accessToken}`);
  return (products.body as { id: string; stockQuantity: number }[]).find((p) => p.id === productId)!.stockQuantity;
}

describe('Devolução/estorno de venda (e2e)', () => {
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

  it('devolução total: restaura estoque, cancela a venda, registra estorno no caixa e cancela o documento fiscal', async () => {
    const tenant = await registerTenant(app, 'devolucao-total');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await addStock(app, tenant.accessToken, productId, 10);
    await openCashSession(app, tenant.accessToken, 5000);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 2 }], payments: [{ method: 'dinheiro', amountCents: 2000 }] });
    expect(sale.status).toBe(201);
    expect(sale.body.fiscalDocument.status).toBe('authorized');
    const saleItemId = sale.body.items[0].id as string;
    expect(await stockQuantity(app, tenant.accessToken, productId)).toBe(8);

    const ret = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ refundMethod: 'dinheiro', reason: 'Cliente desistiu da compra', items: [{ saleItemId, quantity: 2 }] });
    expect(ret.status).toBe(201);
    expect(ret.body.status).toBe('completed');
    expect(ret.body.totalRefundedCents).toBe(2000);

    expect(await stockQuantity(app, tenant.accessToken, productId)).toBe(10);

    const updatedSale = await request(app.getHttpServer())
      .get(`/api/sales/${sale.body.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(updatedSale.body.status).toBe('canceled');
    expect(updatedSale.body.fiscalDocument.status).toBe('canceled');

    const cashSession = await request(app.getHttpServer()).get('/api/cash-sessions/current').set('Authorization', `Bearer ${tenant.accessToken}`);
    const movements = await request(app.getHttpServer())
      .get(`/api/cash-sessions/${cashSession.body.id}/movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    const estorno = (movements.body as { type: string; amountCents: number }[]).find((m) => m.type === 'estorno');
    expect(estorno?.amountCents).toBe(2000);
  });

  it('devolução parcial: mantém a venda completed e não mexe no documento fiscal', async () => {
    const tenant = await registerTenant(app, 'devolucao-parcial');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await addStock(app, tenant.accessToken, productId, 10);
    await openCashSession(app, tenant.accessToken, 5000);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 4 }], payments: [{ method: 'dinheiro', amountCents: 4000 }] });
    const saleItemId = sale.body.items[0].id as string;

    const ret = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ refundMethod: 'dinheiro', reason: 'Comprou a mais por engano', items: [{ saleItemId, quantity: 1 }] });
    expect(ret.status).toBe(201);
    expect(ret.body.totalRefundedCents).toBe(1000);
    expect(await stockQuantity(app, tenant.accessToken, productId)).toBe(7); // 10 - 4 + 1

    const updatedSale = await request(app.getHttpServer())
      .get(`/api/sales/${sale.body.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(updatedSale.body.status).toBe('completed');
    expect(updatedSale.body.fiscalDocument.status).toBe('authorized');
  });

  it('rateia o reembolso proporcionalmente quando a venda teve desconto', async () => {
    const tenant = await registerTenant(app, 'devolucao-desconto');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await addStock(app, tenant.accessToken, productId, 10);
    await openCashSession(app, tenant.accessToken, 5000);

    // subtotal 2000, discount 200 => total 1800 (pays 90% of list price)
    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 2 }], discountCents: 200, payments: [{ method: 'dinheiro', amountCents: 1800 }] });
    const saleItemId = sale.body.items[0].id as string;

    const ret = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ refundMethod: 'dinheiro', reason: 'Defeito', items: [{ saleItemId, quantity: 1 }] });
    expect(ret.status).toBe(201);
    // 1 unit of 1000, prorated at 90% (1800/2000) = 900
    expect(ret.body.totalRefundedCents).toBe(900);
  });

  it('rejeita devolução com quantidade maior que o saldo devolvível — nada é aplicado', async () => {
    const tenant = await registerTenant(app, 'devolucao-excedente');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await addStock(app, tenant.accessToken, productId, 10);
    await openCashSession(app, tenant.accessToken, 5000);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 2 }], payments: [{ method: 'dinheiro', amountCents: 2000 }] });
    const saleItemId = sale.body.items[0].id as string;

    const ret = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ refundMethod: 'dinheiro', reason: 'Erro', items: [{ saleItemId, quantity: 3 }] });
    expect(ret.status).toBe(400);
    expect(await stockQuantity(app, tenant.accessToken, productId)).toBe(8); // unchanged

    const returns = await request(app.getHttpServer())
      .get(`/api/sales/${sale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(returns.body).toHaveLength(0);
  });

  it('agrega quantidade pedida quando o mesmo item aparece mais de uma vez na mesma requisição, em vez de validar cada linha isoladamente', async () => {
    const tenant = await registerTenant(app, 'devolucao-duplicada');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await addStock(app, tenant.accessToken, productId, 10);
    await openCashSession(app, tenant.accessToken, 5000);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 5 }], payments: [{ method: 'dinheiro', amountCents: 5000 }] });
    const saleItemId = sale.body.items[0].id as string;

    // Two lines requesting the same item add up to 10, but only 5 were sold —
    // if each line were validated in isolation against the remaining balance
    // (a real bug found during security review), both would pass and double
    // the refund/stock in a single request, with no race condition involved.
    const excedente = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        refundMethod: 'dinheiro',
        reason: 'Erro',
        items: [
          { saleItemId, quantity: 5 },
          { saleItemId, quantity: 5 },
        ],
      });
    expect(excedente.status).toBe(400);
    expect(await stockQuantity(app, tenant.accessToken, productId)).toBe(5); // unchanged

    // Two lines requesting the same item that together fit within the balance
    // (2+1=3 of 5) must be treated as a single return of 3 units, not
    // generate two stock movements of 3 (which would return 6 in total).
    const dentroDoSaldo = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        refundMethod: 'dinheiro',
        reason: 'Defeito parcial',
        items: [
          { saleItemId, quantity: 2 },
          { saleItemId, quantity: 1 },
        ],
      });
    expect(dentroDoSaldo.status).toBe(201);
    expect(dentroDoSaldo.body.totalRefundedCents).toBe(3000); // 3 units x 1000, not 6
    expect(dentroDoSaldo.body.items).toHaveLength(1); // one aggregated line, not two
    expect(dentroDoSaldo.body.items[0].quantity).toBe(3);
    expect(await stockQuantity(app, tenant.accessToken, productId)).toBe(8); // 5 - 5 + 3
  });

  it('rejeita reembolso em dinheiro sem caixa aberto', async () => {
    const tenant = await registerTenant(app, 'devolucao-sem-caixa');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await addStock(app, tenant.accessToken, productId, 10);
    await openCashSession(app, tenant.accessToken, 5000);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });
    const saleItemId = sale.body.items[0].id as string;

    const cashSession = await request(app.getHttpServer()).get('/api/cash-sessions/current').set('Authorization', `Bearer ${tenant.accessToken}`);
    await request(app.getHttpServer())
      .post(`/api/cash-sessions/${cashSession.body.id}/close`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ closingAmountCents: 6000 });

    const ret = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ refundMethod: 'dinheiro', reason: 'Erro', items: [{ saleItemId, quantity: 1 }] });
    expect(ret.status).toBe(400);
    expect(ret.body.message).toMatch(/abra o caixa/i);
  });

  it('venda com resgate de pontos: devolução fica needs_attention no ponto de fidelidade, mas estoque e caixa aplicam normalmente', async () => {
    const tenant = await registerTenant(app, 'devolucao-resgate');
    const productId = await createProduct(app, tenant.accessToken, 10000);
    await addStock(app, tenant.accessToken, productId, 10);
    const customerId = await createCustomer(app, tenant.accessToken);
    await openCashSession(app, tenant.accessToken, 5000);

    // Earn points on a first purchase to have a balance to redeem on the second.
    const firstSale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ customerId, items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 10000 }] });
    expect(firstSale.body.pointsEarned).toBeGreaterThan(0);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        customerId,
        items: [{ productId, quantity: 1 }],
        pointsToRedeem: 50,
        payments: [{ method: 'dinheiro', amountCents: 10000 - 50 }],
      });
    expect(sale.status).toBe(201);
    expect(sale.body.pointsRedeemed).toBe(50);
    const saleItemId = sale.body.items[0].id as string;

    const ret = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ refundMethod: 'dinheiro', reason: 'Desistiu', items: [{ saleItemId, quantity: 1 }] });
    expect(ret.status).toBe(201);
    expect(ret.body.status).toBe('needs_attention');
    expect(ret.body.issue).toMatch(/resgate de pontos/i);
    expect(await stockQuantity(app, tenant.accessToken, productId)).toBe(9); // 10 - 1 - 1 + 1 + 1
  });

  it('estorno via meio de pagamento chama o provedor e recusa se não há pagamento não-dinheiro na venda', async () => {
    const tenant = await registerTenant(app, 'devolucao-cartao');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await addStock(app, tenant.accessToken, productId, 10);
    await openCashSession(app, tenant.accessToken, 5000);

    const cashSale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });
    const cashSaleItemId = cashSale.body.items[0].id as string;

    const rejectedRet = await request(app.getHttpServer())
      .post(`/api/sales/${cashSale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ refundMethod: 'estorno_pagamento', reason: 'Erro', items: [{ saleItemId: cashSaleItemId, quantity: 1 }] });
    expect(rejectedRet.status).toBe(400);
    expect(rejectedRet.body.message).toMatch(/cartão ou pix/i);

    const cardSale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'pix', amountCents: 1000 }] });
    const cardSaleItemId = cardSale.body.items[0].id as string;

    const ret = await request(app.getHttpServer())
      .post(`/api/sales/${cardSale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ refundMethod: 'estorno_pagamento', reason: 'Defeito', items: [{ saleItemId: cardSaleItemId, quantity: 1 }] });
    expect(ret.status).toBe(201);
    expect(ret.body.status).toBe('completed');
    expect(ret.body.cashSessionId).toBeNull();
  });

  it('venda com pagamento dividido entre dois meios não-dinheiro: estorno rejeitado se nenhuma transação isolada cobre o valor devolvido', async () => {
    const tenant = await registerTenant(app, 'devolucao-pagamento-dividido');
    const productId = await createProduct(app, tenant.accessToken, 5000);
    await addStock(app, tenant.accessToken, productId, 10);
    await openCashSession(app, tenant.accessToken, 5000);

    // R$100 sale split into two R$50 transactions (card + Pix) — neither one,
    // by itself, covers a full R$100 refund.
    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        items: [{ productId, quantity: 2 }],
        payments: [
          { method: 'cartao_credito', amountCents: 5000 },
          { method: 'pix', amountCents: 5000 },
        ],
      });
    const saleItemId = sale.body.items[0].id as string;

    const ret = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ refundMethod: 'estorno_pagamento', reason: 'Desistiu da compra', items: [{ saleItemId, quantity: 2 }] });
    expect(ret.status).toBe(400);
    expect(ret.body.message).toMatch(/excede o que foi cobrado/i);
    expect(await stockQuantity(app, tenant.accessToken, productId)).toBe(8); // unchanged
  });
});
