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

async function createSupplierAndProduct(app: INestApplication, accessToken: string) {
  const supplier = await request(app.getHttpServer())
    .post('/api/suppliers')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Distribuidora Teste' });

  const product = await request(app.getHttpServer())
    .post('/api/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Produto Comprado', priceCents: 1000 });

  return { supplierId: supplier.body.id as string, productId: product.body.id as string };
}

describe('Compras (e2e)', () => {
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

  it('cria pedido em rascunho, recebe e atualiza estoque e custo do produto', async () => {
    const tenant = await registerTenant(app, 'compras-fluxo');
    const { supplierId, productId } = await createSupplierAndProduct(app, tenant.accessToken);

    const create = await request(app.getHttpServer())
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ supplierId, items: [{ productId, quantity: 10, unitCostCents: 500 }] });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe('draft');
    expect(create.body.totalCents).toBe(5000);
    expect(create.body.items).toHaveLength(1);
    expect(create.body.receivedAt).toBeNull();

    const beforeReceive = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(beforeReceive.body.stockQuantity).toBe(0);

    const receive = await request(app.getHttpServer())
      .post(`/api/purchase-orders/${create.body.id}/receive`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(receive.status).toBe(201);
    expect(receive.body.status).toBe('received');
    expect(receive.body.receivedAt).not.toBeNull();

    const afterReceive = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(afterReceive.body.stockQuantity).toBe(10);
    expect(afterReceive.body.costPriceCents).toBe(500);

    const list = await request(app.getHttpServer())
      .get('/api/purchase-orders')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].items).toHaveLength(1);
  });

  it('não permite receber ou cancelar duas vezes o mesmo pedido', async () => {
    const tenant = await registerTenant(app, 'compras-estado');
    const { supplierId, productId } = await createSupplierAndProduct(app, tenant.accessToken);

    const order = await request(app.getHttpServer())
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ supplierId, items: [{ productId, quantity: 1, unitCostCents: 100 }] });

    const receive = await request(app.getHttpServer())
      .post(`/api/purchase-orders/${order.body.id}/receive`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(receive.status).toBe(201);

    const receiveAgain = await request(app.getHttpServer())
      .post(`/api/purchase-orders/${order.body.id}/receive`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(receiveAgain.status).toBe(409);

    const cancelReceived = await request(app.getHttpServer())
      .post(`/api/purchase-orders/${order.body.id}/cancel`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(cancelReceived.status).toBe(409);
  });

  it('cancela pedido em rascunho sem afetar estoque', async () => {
    const tenant = await registerTenant(app, 'compras-cancela');
    const { supplierId, productId } = await createSupplierAndProduct(app, tenant.accessToken);

    const order = await request(app.getHttpServer())
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ supplierId, items: [{ productId, quantity: 5, unitCostCents: 200 }] });

    const cancel = await request(app.getHttpServer())
      .post(`/api/purchase-orders/${order.body.id}/cancel`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(cancel.status).toBe(201);
    expect(cancel.body.status).toBe('canceled');

    const product = await request(app.getHttpServer())
      .get(`/api/products/${productId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(product.body.stockQuantity).toBe(0);

    const cancelAgain = await request(app.getHttpServer())
      .post(`/api/purchase-orders/${order.body.id}/cancel`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(cancelAgain.status).toBe(409);
  });

  it('rejeita pedido com fornecedor ou produto inexistente', async () => {
    const tenant = await registerTenant(app, 'compras-invalido');
    const { productId } = await createSupplierAndProduct(app, tenant.accessToken);

    const badSupplier = await request(app.getHttpServer())
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ supplierId: '00000000-0000-0000-0000-000000000000', items: [{ productId, quantity: 1, unitCostCents: 100 }] });
    expect(badSupplier.status).toBe(404);
  });

  it('isola pedidos de compra entre tenants diferentes (RLS)', async () => {
    const tenantA = await registerTenant(app, 'compras-iso-a');
    const tenantB = await registerTenant(app, 'compras-iso-b');
    const { supplierId, productId } = await createSupplierAndProduct(app, tenantA.accessToken);

    await request(app.getHttpServer())
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ supplierId, items: [{ productId, quantity: 1, unitCostCents: 100 }] });

    const listForB = await request(app.getHttpServer())
      .get('/api/purchase-orders')
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(listForB.body).toEqual([]);
  });

  it('financeiro só lê pedidos de compra, operador de caixa não acessa', async () => {
    const tenant = await registerTenant(app, 'compras-rbac');
    const { supplierId, productId } = await createSupplierAndProduct(app, tenant.accessToken);
    const financeiroToken = await loginAs(app, db, tenant.tenantId, 'financeiro');
    const cashierToken = await loginAs(app, db, tenant.tenantId, 'operador_caixa');

    const listByFinanceiro = await request(app.getHttpServer())
      .get('/api/purchase-orders')
      .set('Authorization', `Bearer ${financeiroToken}`);
    expect(listByFinanceiro.status).toBe(200);

    const createByFinanceiro = await request(app.getHttpServer())
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${financeiroToken}`)
      .send({ supplierId, items: [{ productId, quantity: 1, unitCostCents: 100 }] });
    expect(createByFinanceiro.status).toBe(403);

    const listByCashier = await request(app.getHttpServer())
      .get('/api/purchase-orders')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(listByCashier.status).toBe(403);
  });
});
