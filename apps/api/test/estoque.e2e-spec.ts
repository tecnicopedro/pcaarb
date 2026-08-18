import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { registerTenant } from './helpers/register-tenant';
import { openCashSession } from './helpers/open-cash-session';

async function createProduct(
  app: INestApplication,
  accessToken: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await request(app.getHttpServer())
    .post('/api/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Produto', priceCents: 500, ...overrides });
  return response.body as { id: string; stockQuantity: number; trackStock: boolean };
}

describe('Estoque (e2e)', () => {
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

  it('produto nasce com saldo zero e entrada/saída/ajuste atualizam o saldo corretamente', async () => {
    const tenant = await registerTenant(app, 'estoque-fluxo');
    const product = await createProduct(app, tenant.accessToken);
    expect(product.stockQuantity).toBe(0);
    expect(product.trackStock).toBe(true);

    const entrada = await request(app.getHttpServer())
      .post(`/api/products/${product.id}/stock-movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'entrada', quantity: 100, reason: 'Compra inicial' });
    expect(entrada.status).toBe(201);
    expect(entrada.body.quantity).toBe(100);

    const saida = await request(app.getHttpServer())
      .post(`/api/products/${product.id}/stock-movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'saida', quantity: 30, reason: 'Quebra' });
    expect(saida.status).toBe(201);
    expect(saida.body.quantity).toBe(-30);

    const ajuste = await request(app.getHttpServer())
      .post(`/api/products/${product.id}/stock-movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'ajuste', quantity: -5, reason: 'Contagem física' });
    expect(ajuste.status).toBe(201);
    expect(ajuste.body.quantity).toBe(-5);

    const productAfter = await request(app.getHttpServer())
      .get(`/api/products/${product.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    // 100 - 30 - 5 = 65
    expect(productAfter.body.stockQuantity).toBe(65);

    const history = await request(app.getHttpServer())
      .get(`/api/products/${product.id}/stock-movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(history.body).toHaveLength(3);
  });

  it('rejeita saída/ajuste que deixaria o saldo negativo', async () => {
    const tenant = await registerTenant(app, 'estoque-negativo');
    const product = await createProduct(app, tenant.accessToken);
    await request(app.getHttpServer())
      .post(`/api/products/${product.id}/stock-movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'entrada', quantity: 10 });

    const saidaExcessiva = await request(app.getHttpServer())
      .post(`/api/products/${product.id}/stock-movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'saida', quantity: 20 });
    expect(saidaExcessiva.status).toBe(400);
    expect(saidaExcessiva.body.message).toMatch(/estoque insuficiente/i);

    const ajusteExcessivo = await request(app.getHttpServer())
      .post(`/api/products/${product.id}/stock-movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'ajuste', quantity: -50 });
    expect(ajusteExcessivo.status).toBe(400);
  });

  it('venda no PDV desconta o estoque automaticamente e bloqueia venda sem saldo suficiente', async () => {
    const tenant = await registerTenant(app, 'estoque-pdv');
    const product = await createProduct(app, tenant.accessToken);
    await request(app.getHttpServer())
      .post(`/api/products/${product.id}/stock-movements`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'entrada', quantity: 5 });
    await openCashSession(app, tenant.accessToken);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId: product.id, quantity: 3 }], payments: [{ method: 'dinheiro', amountCents: 1500 }] });
    expect(sale.status).toBe(201);

    const productAfterSale = await request(app.getHttpServer())
      .get(`/api/products/${product.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(productAfterSale.body.stockQuantity).toBe(2);

    const saleWithoutStock = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId: product.id, quantity: 3 }], payments: [{ method: 'dinheiro', amountCents: 1500 }] });
    expect(saleWithoutStock.status).toBe(400);
    expect(saleWithoutStock.body.message).toMatch(/estoque insuficiente/i);

    const productUnchanged = await request(app.getHttpServer())
      .get(`/api/products/${product.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(productUnchanged.body.stockQuantity).toBe(2);
  });

  it('produto com trackStock desabilitado não é afetado por vendas', async () => {
    const tenant = await registerTenant(app, 'estoque-sem-controle');
    const product = await createProduct(app, tenant.accessToken, { trackStock: false });
    await openCashSession(app, tenant.accessToken);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        items: [{ productId: product.id, quantity: 999 }],
        payments: [{ method: 'dinheiro', amountCents: 999 * 500 }],
      });
    expect(sale.status).toBe(201);

    const productAfterSale = await request(app.getHttpServer())
      .get(`/api/products/${product.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(productAfterSale.body.stockQuantity).toBe(0);
  });

  it('operador de caixa não pode registrar movimentação manual de estoque', async () => {
    const tenant = await registerTenant(app, 'estoque-rbac');
    const product = await createProduct(app, tenant.accessToken);

    const cashierEmail = `caixa-estoque-${Date.now()}@pcaarb.test`;
    const passwordHash = await bcrypt.hash('SenhaForte123', 12);
    await db.insert(users).values({
      tenantId: tenant.tenantId,
      name: 'Operador de Caixa',
      email: cashierEmail,
      passwordHash,
      role: 'operador_caixa',
    });
    const cashierLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: cashierEmail, password: 'SenhaForte123' });
    const cashierToken = cashierLogin.body.accessToken as string;

    const movement = await request(app.getHttpServer())
      .post(`/api/products/${product.id}/stock-movements`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ type: 'entrada', quantity: 10 });
    expect(movement.status).toBe(403);
  });
});
