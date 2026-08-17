import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../src/modules/payments/payment-provider.interface';
import { FISCAL_PROVIDER, type FiscalProvider } from '../src/modules/fiscal/fiscal-provider.interface';
import { registerTenant } from './helpers/register-tenant';

async function createProduct(app: INestApplication, accessToken: string, priceCents: number, name = 'Produto') {
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

async function loginAs(app: INestApplication, db: Database, tenantId: string, role: 'operador_caixa') {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
  const passwordHash = await bcrypt.hash('SenhaForte123', 12);
  await db.insert(users).values({ tenantId, name: role, email, passwordHash, role });
  const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'SenhaForte123' });
  return login.body.accessToken as string;
}

describe('Fiscal e pagamento integrado (e2e)', () => {
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

  it('emite NFC-e (sandbox) automaticamente e registra a transação do gateway para pagamento não-dinheiro', async () => {
    const tenant = await registerTenant(app, 'fiscal-pagamento-ok');
    const productId = await createProduct(app, tenant.accessToken, 1500);
    await openCashSession(app, tenant.accessToken);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        items: [{ productId, quantity: 1 }],
        payments: [
          { method: 'cartao_credito', amountCents: 1000 },
          { method: 'dinheiro', amountCents: 500 },
        ],
      });

    expect(sale.status).toBe(201);
    const cardPayment = sale.body.payments.find((p: { method: string }) => p.method === 'cartao_credito');
    const cashPayment = sale.body.payments.find((p: { method: string }) => p.method === 'dinheiro');
    expect(cardPayment.providerTransactionId).toMatch(/^mock_cartao_credito_/);
    expect(cashPayment.providerTransactionId).toBeNull();

    expect(sale.body.fiscalDocument.status).toBe('authorized');
    expect(sale.body.fiscalDocument.accessKey).toMatch(/^\d{44}$/);

    const found = await request(app.getHttpServer())
      .get(`/api/sales/${sale.body.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(found.body.fiscalDocument.accessKey).toBe(sale.body.fiscalDocument.accessKey);
  });

  it('reemitir documento fiscal já autorizado é rejeitado', async () => {
    const tenant = await registerTenant(app, 'fiscal-retry-autorizado');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await openCashSession(app, tenant.accessToken);
    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });

    const retry = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/fiscal-document/retry`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(retry.status).toBe(409);
  });

  it('operador de caixa não pode reemitir documento fiscal', async () => {
    const tenant = await registerTenant(app, 'fiscal-rbac');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await openCashSession(app, tenant.accessToken);
    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });

    const cashierToken = await loginAs(app, db, tenant.tenantId, 'operador_caixa');
    const retry = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/fiscal-document/retry`)
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(retry.status).toBe(403);
  });
});

describe('Fiscal e pagamento integrado — gateway recusado (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const decliningProvider: PaymentProvider = {
      async charge() {
        return { approved: false, providerTransactionId: 'n/a', declineReason: 'saldo insuficiente (simulado)' };
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(decliningProvider)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('recusa do gateway cancela a venda inteira (nada fica persistido)', async () => {
    const tenant = await registerTenant(app, 'fiscal-pagamento-recusado');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await openCashSession(app, tenant.accessToken);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'pix', amountCents: 1000 }] });

    expect(sale.status).toBe(400);
    expect(sale.body.message).toMatch(/recusad[ao]/i);

    const list = await request(app.getHttpServer())
      .get('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(list.body).toHaveLength(0);
  });
});

describe('Fiscal e pagamento integrado — provedor fiscal indisponível (e2e)', () => {
  let app: INestApplication;
  let shouldFail = true;

  beforeAll(async () => {
    const flakyProvider: FiscalProvider = {
      async issueNFCe() {
        if (shouldFail) {
          throw new Error('SEFAZ indisponível (simulado)');
        }
        return { authorized: true, accessKey: '1'.repeat(44), documentUrl: 'https://example.test/nfce' };
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FISCAL_PROVIDER)
      .useValue(flakyProvider)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('venda continua mesmo com o fiscal fora do ar, e reemissão manual funciona quando ele volta', async () => {
    const tenant = await registerTenant(app, 'fiscal-contingencia');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await openCashSession(app, tenant.accessToken);

    shouldFail = true;
    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });
    expect(sale.status).toBe(201);
    expect(sale.body.fiscalDocument.status).toBe('rejected');
    expect(sale.body.fiscalDocument.rejectionReason).toMatch(/provedor fiscal/i);

    shouldFail = false;
    const retry = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/fiscal-document/retry`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(retry.status).toBe(201);
    expect(retry.body.status).toBe('authorized');
    expect(retry.body.accessKey).toBe('1'.repeat(44));
  });
});
