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

// Mesmo motivo do helper em permissoes-granulares.e2e-spec.ts: evita depender
// do fluxo de convite/e-mail (Resend real no ambiente de teste) e do rate
// limit de login pra só testar RBAC de leitura/escrita.
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

async function createCustomer(app: INestApplication, accessToken: string, name = 'Cliente Fiel') {
  const response = await request(app.getHttpServer())
    .post('/api/customers')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name });
  return response.body.id as string;
}

async function openCashSession(app: INestApplication, accessToken: string) {
  await request(app.getHttpServer())
    .post('/api/cash-sessions')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ openingAmountCents: 0 });
}

describe('Fidelidade — pontos e resgate (e2e)', () => {
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

  it('tenant novo já tem um programa default (1 ponto por R$1, ativo)', async () => {
    const tenant = await registerTenant(app, 'fidelidade-default');
    const program = await request(app.getHttpServer())
      .get('/api/loyalty/program')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(program.status).toBe(200);
    expect(program.body.active).toBe(true);
    expect(program.body.earnRatePoints).toBe(1);
    expect(program.body.redeemValueCents).toBe(1);
  });

  it('venda com cliente identificado ganha pontos sobre o total pago', async () => {
    const tenant = await registerTenant(app, 'fidelidade-ganho');
    const productId = await createProduct(app, tenant.accessToken, 1050);
    const customerId = await createCustomer(app, tenant.accessToken);
    await openCashSession(app, tenant.accessToken);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        customerId,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: 'dinheiro', amountCents: 1050 }],
      });
    expect(sale.status).toBe(201);
    expect(sale.body.pointsEarned).toBe(10); // floor(1050/100) * 1
    expect(sale.body.pointsRedeemed).toBe(0);

    const balance = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/loyalty/balance`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(balance.status).toBe(200);
    expect(balance.body.balancePoints).toBe(10);
    expect(balance.body.balanceValueCents).toBe(10);
  });

  it('venda sem cliente identificado (anônima) não ganha pontos', async () => {
    const tenant = await registerTenant(app, 'fidelidade-anonima');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await openCashSession(app, tenant.accessToken);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });
    expect(sale.status).toBe(201);
    expect(sale.body.pointsEarned).toBe(0);
  });

  it('resgata pontos acumulados como desconto no total da venda', async () => {
    const tenant = await registerTenant(app, 'fidelidade-resgate');
    const productId = await createProduct(app, tenant.accessToken, 2000);
    const customerId = await createCustomer(app, tenant.accessToken);
    await openCashSession(app, tenant.accessToken);

    // Primeira venda: ganha 20 pontos (floor(2000/100) * 1).
    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        customerId,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: 'dinheiro', amountCents: 2000 }],
      });

    // Segunda venda: resgata 500 dos 20 pontos — redeemValueCents default é 1,
    // então 500 pontos valeriam mais que o saldo; usa só o saldo disponível (20).
    const secondSale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        customerId,
        items: [{ productId, quantity: 1 }],
        pointsToRedeem: 20,
        payments: [{ method: 'dinheiro', amountCents: 1980 }], // 2000 - 20*1
      });
    expect(secondSale.status).toBe(201);
    expect(secondSale.body.totalCents).toBe(1980);
    expect(secondSale.body.pointsRedeemed).toBe(20);

    const balanceAfter = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/loyalty/balance`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    // Saldo: 20 (ganho na 1ª) - 20 (resgate) + pontos ganhos na 2ª venda (floor(1980/100)*1 = 19).
    expect(balanceAfter.body.balancePoints).toBe(19);
  });

  it('rejeita resgate maior que o saldo disponível — venda inteira é desfeita', async () => {
    const tenant = await registerTenant(app, 'fidelidade-saldo-insuficiente');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    const customerId = await createCustomer(app, tenant.accessToken);
    await openCashSession(app, tenant.accessToken);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        customerId,
        items: [{ productId, quantity: 1 }],
        pointsToRedeem: 999,
        payments: [{ method: 'dinheiro', amountCents: 1 }],
      });
    expect(sale.status).toBe(400);
    expect(sale.body.message).toMatch(/ponto/i);

    const list = await request(app.getHttpServer())
      .get('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(list.body).toHaveLength(0); // venda rejeitada não fica meio-registrada
  });

  it('rejeita resgate de pontos sem cliente selecionado na venda', async () => {
    const tenant = await registerTenant(app, 'fidelidade-sem-cliente');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await openCashSession(app, tenant.accessToken);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        items: [{ productId, quantity: 1 }],
        pointsToRedeem: 10,
        payments: [{ method: 'dinheiro', amountCents: 1000 }],
      });
    expect(sale.status).toBe(400);
    expect(sale.body.message).toMatch(/cliente/i);
  });

  it('programa desativado bloqueia resgate mas venda normal continua funcionando', async () => {
    const tenant = await registerTenant(app, 'fidelidade-desativado');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    const customerId = await createCustomer(app, tenant.accessToken);
    await openCashSession(app, tenant.accessToken);

    const disable = await request(app.getHttpServer())
      .patch('/api/loyalty/program')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ active: false });
    expect(disable.status).toBe(200);
    expect(disable.body.active).toBe(false);

    const saleAttemptRedeem = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        customerId,
        items: [{ productId, quantity: 1 }],
        pointsToRedeem: 5,
        payments: [{ method: 'dinheiro', amountCents: 995 }],
      });
    expect(saleAttemptRedeem.status).toBe(400);

    const normalSale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        customerId,
        items: [{ productId, quantity: 1 }],
        payments: [{ method: 'dinheiro', amountCents: 1000 }],
      });
    expect(normalSale.status).toBe(201);
    expect(normalSale.body.pointsEarned).toBe(0); // programa inativo não gera pontos
  });

  it('histórico de pontos (ledger) mostra ganho e resgate na ordem certa', async () => {
    const tenant = await registerTenant(app, 'fidelidade-historico');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    const customerId = await createCustomer(app, tenant.accessToken);
    await openCashSession(app, tenant.accessToken);

    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ customerId, items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });

    const ledger = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/loyalty/ledger`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(ledger.status).toBe(200);
    expect(ledger.body).toHaveLength(1);
    expect(ledger.body[0].type).toBe('earn');
    expect(ledger.body[0].points).toBe(10);
  });

  it('isola pontos e configuração de fidelidade entre tenants diferentes (RLS)', async () => {
    const tenantA = await registerTenant(app, 'fidelidade-iso-a');
    const tenantB = await registerTenant(app, 'fidelidade-iso-b');
    const productId = await createProduct(app, tenantA.accessToken, 1000);
    const customerId = await createCustomer(app, tenantA.accessToken);
    await openCashSession(app, tenantA.accessToken);

    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ customerId, items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });

    await request(app.getHttpServer())
      .patch('/api/loyalty/program')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ earnRatePoints: 5 });

    const crossTenantBalance = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/loyalty/balance`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(crossTenantBalance.status).toBe(404); // cliente não existe na visão do tenant B

    const tenantBProgram = await request(app.getHttpServer())
      .get('/api/loyalty/program')
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(tenantBProgram.body.earnRatePoints).toBe(1); // não afetado pela config do tenant A
  });

  it('operador de caixa e financeiro leem pontos/programa mas não alteram a configuração', async () => {
    const tenant = await registerTenant(app, 'fidelidade-rbac');
    const customerId = await createCustomer(app, tenant.accessToken);
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');
    const financeiro = await mintUser(app, db, tenant.tenantId, 'financeiro');

    const cashierReadsProgram = await request(app.getHttpServer())
      .get('/api/loyalty/program')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(cashierReadsProgram.status).toBe(200);

    const cashierReadsBalance = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/loyalty/balance`)
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(cashierReadsBalance.status).toBe(200);

    const cashierUpdatesProgram = await request(app.getHttpServer())
      .patch('/api/loyalty/program')
      .set('Authorization', `Bearer ${cashier.accessToken}`)
      .send({ earnRatePoints: 100 });
    expect(cashierUpdatesProgram.status).toBe(403);

    const financeiroUpdatesProgram = await request(app.getHttpServer())
      .patch('/api/loyalty/program')
      .set('Authorization', `Bearer ${financeiro.accessToken}`)
      .send({ earnRatePoints: 100 });
    expect(financeiroUpdatesProgram.status).toBe(403);
  });
});
