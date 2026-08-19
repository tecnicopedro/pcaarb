import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { MARKETPLACE_PROVIDER, type MarketplaceProvider } from '../src/modules/marketplace/marketplace-provider.interface';
import { registerTenant } from './helpers/register-tenant';

async function loginAs(app: INestApplication, db: Database, tenantId: string, role: 'financeiro' | 'operador_caixa') {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
  const passwordHash = await bcrypt.hash('SenhaForte123', 12);
  await db.insert(users).values({ tenantId, name: role, email, passwordHash, role });
  const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'SenhaForte123' });
  return login.body.accessToken as string;
}

async function createProduct(app: INestApplication, accessToken: string, name: string, priceCents: number) {
  const response = await request(app.getHttpServer())
    .post('/api/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, priceCents, trackStock: true });
  return response.body.id as string;
}

async function addStock(app: INestApplication, accessToken: string, productId: string, quantity: number) {
  return request(app.getHttpServer())
    .post(`/api/products/${productId}/stock-movements`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ type: 'entrada', quantity });
}

async function createChannel(app: INestApplication, accessToken: string, name = 'Loja teste') {
  const response = await request(app.getHttpServer())
    .post('/api/marketplace/channels')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name });
  return response.body as { id: string; name: string; active: boolean };
}

describe('Integração de marketplace — canais e sincronização de produto (e2e)', () => {
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

  it('cria canal (sandbox), lista, e desativa', async () => {
    const tenant = await registerTenant(app, 'marketplace-canal');
    const channel = await createChannel(app, tenant.accessToken, 'Minha loja no Mercado Livre');
    expect(channel.active).toBe(true);
    expect(channel.name).toBe('Minha loja no Mercado Livre');

    const list = await request(app.getHttpServer())
      .get('/api/marketplace/channels')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(list.body).toHaveLength(1);

    const deactivated = await request(app.getHttpServer())
      .patch(`/api/marketplace/channels/${channel.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ active: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.active).toBe(false);
  });

  it('financeiro e operador de caixa não acessam integrações (configuração de canal externo é admin/owner)', async () => {
    const tenant = await registerTenant(app, 'marketplace-rbac');
    const financeiroToken = await loginAs(app, db, tenant.tenantId, 'financeiro');
    const cashierToken = await loginAs(app, db, tenant.tenantId, 'operador_caixa');

    const financeiroAttempt = await request(app.getHttpServer())
      .get('/api/marketplace/channels')
      .set('Authorization', `Bearer ${financeiroToken}`);
    expect(financeiroAttempt.status).toBe(403);

    const cashierAttempt = await request(app.getHttpServer())
      .post('/api/marketplace/channels')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ name: 'Tentativa' });
    expect(cashierAttempt.status).toBe(403);
  });

  it('sincroniza um produto (idempotente — sincronizar de novo atualiza a mesma listagem, não duplica)', async () => {
    const tenant = await registerTenant(app, 'marketplace-sync');
    const channel = await createChannel(app, tenant.accessToken);
    const productId = await createProduct(app, tenant.accessToken, 'Camiseta', 4900);

    const firstSync = await request(app.getHttpServer())
      .post(`/api/marketplace/channels/${channel.id}/listings/${productId}/sync`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(firstSync.status).toBe(201);
    expect(firstSync.body.status).toBe('synced');
    expect(firstSync.body.externalProductId).toMatch(/^mock_prod_/);

    const secondSync = await request(app.getHttpServer())
      .post(`/api/marketplace/channels/${channel.id}/listings/${productId}/sync`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(secondSync.status).toBe(201);
    expect(secondSync.body.id).toBe(firstSync.body.id);

    const listings = await request(app.getHttpServer())
      .get(`/api/marketplace/channels/${channel.id}/listings`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(listings.body).toHaveLength(1);
    expect(listings.body[0].productName).toBe('Camiseta');
  });

  it('sincronizar produto num canal inativo é rejeitado', async () => {
    const tenant = await registerTenant(app, 'marketplace-sync-inativo');
    const channel = await createChannel(app, tenant.accessToken);
    const productId = await createProduct(app, tenant.accessToken, 'Caneca', 2500);
    await request(app.getHttpServer())
      .patch(`/api/marketplace/channels/${channel.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ active: false });

    const sync = await request(app.getHttpServer())
      .post(`/api/marketplace/channels/${channel.id}/listings/${productId}/sync`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(sync.status).toBe(400);
  });

  it('buscar pedidos novos num canal sem pedidos (sandbox real) devolve lista vazia', async () => {
    const tenant = await registerTenant(app, 'marketplace-pull-vazio');
    const channel = await createChannel(app, tenant.accessToken);

    const pull = await request(app.getHttpServer())
      .post(`/api/marketplace/channels/${channel.id}/orders/pull`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(pull.status).toBe(201);
    expect(pull.body.fetched).toBe(0);
    expect(pull.body.orders).toHaveLength(0);
  });
});

describe('Integração de marketplace — importação de pedidos (e2e, provider fabricado)', () => {
  let app: INestApplication;

  // Test provider that returns the SAME orders every time fetchNewOrders is
  // called — simulates an orders API that lists recent history (not a queue
  // that drains), specifically to test that a second sync doesn't reapply
  // what's already been imported.
  const testOrders = [
    {
      externalOrderId: 'order-ok-1',
      totalCents: 5000,
      items: [{ externalProductId: 'ext-widget', quantity: 2, unitPriceCents: 2500 }],
    },
    {
      externalOrderId: 'order-unmapped-1',
      totalCents: 3000,
      items: [{ externalProductId: 'ext-nao-sincronizado', quantity: 1, unitPriceCents: 3000 }],
    },
    {
      externalOrderId: 'order-sem-estoque-1',
      totalCents: 100000,
      items: [{ externalProductId: 'ext-widget', quantity: 999, unitPriceCents: 100 }],
    },
  ];

  const fakeProvider: MarketplaceProvider = {
    async syncProduct(params) {
      return { externalProductId: `ext-${params.productName.toLowerCase()}` };
    },
    async fetchNewOrders() {
      return testOrders;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MARKETPLACE_PROVIDER)
      .useValue(fakeProvider)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('importa pedido com produto mapeado e estoque suficiente, sinaliza os que não podem ser aplicados, e nunca reaplica no replay (idempotência)', async () => {
    const tenant = await registerTenant(app, 'marketplace-pull');
    const channel = await createChannel(app, tenant.accessToken);
    const productId = await createProduct(app, tenant.accessToken, 'Widget', 2500);
    await addStock(app, tenant.accessToken, productId, 10);
    await request(app.getHttpServer())
      .post(`/api/marketplace/channels/${channel.id}/listings/${productId}/sync`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);

    const firstPull = await request(app.getHttpServer())
      .post(`/api/marketplace/channels/${channel.id}/orders/pull`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(firstPull.status).toBe(201);
    expect(firstPull.body.fetched).toBe(3);
    expect(firstPull.body.imported).toBe(1);
    expect(firstPull.body.needsAttention).toBe(2);
    expect(firstPull.body.alreadyProcessed).toBe(0);

    const ok = firstPull.body.orders.find((o: { externalOrderId: string }) => o.externalOrderId === 'order-ok-1');
    expect(ok.status).toBe('imported');

    const unmapped = firstPull.body.orders.find((o: { externalOrderId: string }) => o.externalOrderId === 'order-unmapped-1');
    expect(unmapped.status).toBe('needs_attention');
    expect(unmapped.issue).toMatch(/não está sincronizado/i);

    const shortStock = firstPull.body.orders.find((o: { externalOrderId: string }) => o.externalOrderId === 'order-sem-estoque-1');
    expect(shortStock.status).toBe('needs_attention');
    expect(shortStock.issue).toMatch(/estoque insuficiente/i);

    // Widget started with 10, the imported order consumed 2 (the one with
    // 999 was NOT applied, since the whole order was rejected) — balance should be 8.
    const productAfterFirstPull = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    const widget = productAfterFirstPull.body.find((p: { id: string }) => p.id === productId);
    expect(widget.stockQuantity).toBe(8);

    // Replay: the fake provider returns the SAME 3 orders again — nothing
    // can be reapplied, and stock cannot change again.
    const secondPull = await request(app.getHttpServer())
      .post(`/api/marketplace/channels/${channel.id}/orders/pull`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(secondPull.status).toBe(201);
    expect(secondPull.body.fetched).toBe(3);
    expect(secondPull.body.imported).toBe(0);
    expect(secondPull.body.needsAttention).toBe(0);
    expect(secondPull.body.alreadyProcessed).toBe(3);

    const productAfterSecondPull = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    const widgetAfter = productAfterSecondPull.body.find((p: { id: string }) => p.id === productId);
    expect(widgetAfter.stockQuantity).toBe(8);

    const orders = await request(app.getHttpServer())
      .get(`/api/marketplace/channels/${channel.id}/orders`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(orders.body).toHaveLength(3);
  });
});
