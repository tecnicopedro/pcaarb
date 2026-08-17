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

async function createProduct(app: INestApplication, accessToken: string, priceCents: number, name: string) {
  const response = await request(app.getHttpServer())
    .post('/api/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, priceCents, trackStock: false });
  return response.body.id as string;
}

async function openCashSession(app: INestApplication, accessToken: string) {
  await request(app.getHttpServer())
    .post('/api/cash-sessions')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ openingAmountCents: 0 });
}

async function sell(app: INestApplication, accessToken: string, productId: string, quantity: number, priceCents: number) {
  const totalCents = quantity * priceCents;
  return request(app.getHttpServer())
    .post('/api/sales')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      items: [{ productId, quantity }],
      payments: [{ method: 'dinheiro', amountCents: totalCents }],
    });
}

describe('Relatórios (e2e)', () => {
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

  it('resumo, ranking de produtos e curva ABC agregam as vendas concluídas do período', async () => {
    const tenant = await registerTenant(app, 'reports-fluxo');
    const productA = await createProduct(app, tenant.accessToken, 1000, 'Produto A');
    const productB = await createProduct(app, tenant.accessToken, 500, 'Produto B');
    await openCashSession(app, tenant.accessToken);

    const saleA = await sell(app, tenant.accessToken, productA, 3, 1000); // 3000
    await sell(app, tenant.accessToken, productB, 2, 500); // 1000
    expect(saleA.status).toBe(201);

    const summary = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(summary.status).toBe(200);
    expect(summary.body.totalSales).toBe(2);
    expect(summary.body.totalRevenueCents).toBe(4000);
    expect(summary.body.averageTicketCents).toBe(2000);

    const ranking = await request(app.getHttpServer())
      .get('/api/reports/produtos-ranking')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(ranking.status).toBe(200);
    expect(ranking.body).toHaveLength(2);
    expect(ranking.body[0].productId).toBe(productA);
    expect(ranking.body[0].revenueCents).toBe(3000);
    expect(ranking.body[0].quantitySold).toBe(3);
    expect(ranking.body[1].revenueCents).toBe(1000);

    const abc = await request(app.getHttpServer())
      .get('/api/reports/curva-abc')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(abc.status).toBe(200);
    expect(abc.body).toHaveLength(2);
    expect(abc.body[0].class).toBe('A');
    expect(abc.body[0].cumulativeSharePercent).toBeCloseTo(75, 5);
    expect(abc.body[1].cumulativeSharePercent).toBeCloseTo(100, 5);

    const sellers = await request(app.getHttpServer())
      .get('/api/reports/vendedores-ranking')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(sellers.status).toBe(200);
    expect(sellers.body).toHaveLength(1);
    expect(sellers.body[0].sellerId).toBe(tenant.userId);
    expect(sellers.body[0].totalSales).toBe(2);
    expect(sellers.body[0].revenueCents).toBe(4000);
  });

  it('sem vendas no período retorna resumo zerado e listas vazias', async () => {
    const tenant = await registerTenant(app, 'reports-vazio');

    const summary = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(summary.body).toMatchObject({ totalSales: 0, totalRevenueCents: 0, averageTicketCents: 0 });

    const ranking = await request(app.getHttpServer())
      .get('/api/reports/produtos-ranking')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(ranking.body).toEqual([]);

    const abc = await request(app.getHttpServer())
      .get('/api/reports/curva-abc')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(abc.body).toEqual([]);
  });

  it('rejeita período em formato inválido', async () => {
    const tenant = await registerTenant(app, 'reports-invalido');
    const response = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo?from=01-01-2026')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(response.status).toBe(400);
  });

  it('isola relatórios entre tenants diferentes (RLS)', async () => {
    const tenantA = await registerTenant(app, 'reports-iso-a');
    const tenantB = await registerTenant(app, 'reports-iso-b');
    const productId = await createProduct(app, tenantA.accessToken, 1000, 'Produto Isolado');
    await openCashSession(app, tenantA.accessToken);
    await sell(app, tenantA.accessToken, productId, 1, 1000);

    const summaryB = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo')
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(summaryB.body.totalSales).toBe(0);
  });

  it('financeiro lê relatórios, operador de caixa não acessa', async () => {
    const tenant = await registerTenant(app, 'reports-rbac');
    const financeiroToken = await loginAs(app, db, tenant.tenantId, 'financeiro');
    const cashierToken = await loginAs(app, db, tenant.tenantId, 'operador_caixa');

    const asFinanceiro = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo')
      .set('Authorization', `Bearer ${financeiroToken}`);
    expect(asFinanceiro.status).toBe(200);

    const asCashier = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(asCashier.status).toBe(403);
  });
});
