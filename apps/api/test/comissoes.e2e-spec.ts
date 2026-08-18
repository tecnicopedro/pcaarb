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

// Mesmo helper de fidelidade.e2e-spec.ts / permissoes-granulares.e2e-spec.ts:
// cria o usuário direto no banco, sem depender do fluxo de convite/e-mail.
async function mintUser(app: INestApplication, db: Database, tenantId: string, role: 'operador_caixa' | 'financeiro') {
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

async function sell(app: INestApplication, accessToken: string, productId: string, priceCents: number) {
  return request(app.getHttpServer())
    .post('/api/sales')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: priceCents }] });
}

describe('Comissão de vendedores (e2e)', () => {
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

  it('tenant novo já tem configuração default (ativo, taxa 0)', async () => {
    const tenant = await registerTenant(app, 'comissao-default');
    const settings = await request(app.getHttpServer())
      .get('/api/commissions/settings')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(settings.status).toBe(200);
    expect(settings.body.active).toBe(true);
    expect(settings.body.defaultRateBps).toBe(0);
  });

  it('relatório de comissão aplica a taxa padrão do tenant sobre a receita do vendedor', async () => {
    const tenant = await registerTenant(app, 'comissao-padrao');
    const productId = await createProduct(app, tenant.accessToken, 10_000);
    await openCashSession(app, tenant.accessToken);

    const updateSettings = await request(app.getHttpServer())
      .patch('/api/commissions/settings')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ defaultRateBps: 500 }); // 5%
    expect(updateSettings.status).toBe(200);
    expect(updateSettings.body.defaultRateBps).toBe(500);

    const sale = await sell(app, tenant.accessToken, productId, 10_000);
    expect(sale.status).toBe(201);

    const report = await request(app.getHttpServer())
      .get('/api/reports/comissoes')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(report.status).toBe(200);
    expect(report.body.porVendedor).toHaveLength(1);
    expect(report.body.porVendedor[0].sellerId).toBe(tenant.userId);
    expect(report.body.porVendedor[0].revenueCents).toBe(10_000);
    expect(report.body.porVendedor[0].rateBps).toBe(500);
    expect(report.body.porVendedor[0].commissionCents).toBe(500); // 5% de 10000
    expect(report.body.totalCommissionCents).toBe(500);
  });

  it('taxa individual do vendedor sobrepõe a taxa padrão do tenant', async () => {
    const tenant = await registerTenant(app, 'comissao-override');
    const productId = await createProduct(app, tenant.accessToken, 10_000);
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');
    await openCashSession(app, tenant.accessToken);
    await openCashSession(app, cashier.accessToken);

    await request(app.getHttpServer())
      .patch('/api/commissions/settings')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ defaultRateBps: 500 }); // 5% pro dono

    const setOverride = await request(app.getHttpServer())
      .put(`/api/commissions/rates/${cashier.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ rateBps: 1000 }); // 10% pro caixa
    expect(setOverride.status).toBe(200);
    expect(setOverride.body.rateBps).toBe(1000);

    await sell(app, tenant.accessToken, productId, 10_000);
    await sell(app, cashier.accessToken, productId, 10_000);

    const report = await request(app.getHttpServer())
      .get('/api/reports/comissoes')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    const bySeller = new Map(report.body.porVendedor.map((item: { sellerId: string }) => [item.sellerId, item]));
    expect((bySeller.get(tenant.userId) as { commissionCents: number }).commissionCents).toBe(500); // 5% de 10000
    expect((bySeller.get(cashier.id) as { commissionCents: number }).commissionCents).toBe(1000); // 10% de 10000
    expect(report.body.totalCommissionCents).toBe(1500);

    const rates = await request(app.getHttpServer())
      .get('/api/commissions/rates')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(rates.body).toHaveLength(1);
    expect(rates.body[0].userId).toBe(cashier.id);
    expect(rates.body[0].rateBps).toBe(1000);

    const removeOverride = await request(app.getHttpServer())
      .delete(`/api/commissions/rates/${cashier.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(removeOverride.status).toBe(200);

    const reportAfterRemoval = await request(app.getHttpServer())
      .get('/api/reports/comissoes')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    const bySellerAfter = new Map(reportAfterRemoval.body.porVendedor.map((item: { sellerId: string }) => [item.sellerId, item]));
    expect((bySellerAfter.get(cashier.id) as { commissionCents: number }).commissionCents).toBe(500); // voltou pro padrão 5%
  });

  it('operador de caixa lê o relatório mas não configura taxas; financeiro idem', async () => {
    const tenant = await registerTenant(app, 'comissao-rbac');
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');
    const financeiro = await mintUser(app, db, tenant.tenantId, 'financeiro');

    const cashierReadsSettings = await request(app.getHttpServer())
      .get('/api/commissions/settings')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(cashierReadsSettings.status).toBe(403); // operador_caixa não tem 'read' em Report

    const financeiroReadsSettings = await request(app.getHttpServer())
      .get('/api/commissions/settings')
      .set('Authorization', `Bearer ${financeiro.accessToken}`);
    expect(financeiroReadsSettings.status).toBe(200);

    const financeiroUpdatesSettings = await request(app.getHttpServer())
      .patch('/api/commissions/settings')
      .set('Authorization', `Bearer ${financeiro.accessToken}`)
      .send({ defaultRateBps: 1000 });
    expect(financeiroUpdatesSettings.status).toBe(403); // financeiro só tem 'read' em Report, não 'manage'

    const ownerUpdatesSettings = await request(app.getHttpServer())
      .patch('/api/commissions/settings')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ defaultRateBps: 1000 });
    expect(ownerUpdatesSettings.status).toBe(200);
  });

  it('não permite taxa fora do intervalo 0-10000 bps', async () => {
    const tenant = await registerTenant(app, 'comissao-validacao');
    const invalid = await request(app.getHttpServer())
      .patch('/api/commissions/settings')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ defaultRateBps: 10_001 });
    expect(invalid.status).toBe(400);
  });

  it('isola configuração e taxas entre tenants diferentes (RLS)', async () => {
    const tenantA = await registerTenant(app, 'comissao-iso-a');
    const tenantB = await registerTenant(app, 'comissao-iso-b');

    await request(app.getHttpServer())
      .patch('/api/commissions/settings')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ defaultRateBps: 800 });

    const tenantBSettings = await request(app.getHttpServer())
      .get('/api/commissions/settings')
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(tenantBSettings.body.defaultRateBps).toBe(0); // não afetado pela config do tenant A

    const crossTenantOverride = await request(app.getHttpServer())
      .put(`/api/commissions/rates/${tenantA.userId}`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .send({ rateBps: 100 });
    expect(crossTenantOverride.status).toBe(404); // vendedor do tenant A não existe na visão do tenant B
  });
});
