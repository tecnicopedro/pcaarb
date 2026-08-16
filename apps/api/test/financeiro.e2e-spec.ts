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

describe('Financeiro (e2e)', () => {
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

  it('cria, lista, paga e cancela contas a pagar/receber', async () => {
    const tenant = await registerTenant(app, 'financeiro-fluxo');

    const payable = await request(app.getHttpServer())
      .post('/api/finance-entries')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'payable', description: 'Conta de luz', amountCents: 15000, dueDate: '2026-09-01' });
    expect(payable.status).toBe(201);
    expect(payable.body.status).toBe('pending');

    const receivable = await request(app.getHttpServer())
      .post('/api/finance-entries')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'receivable', description: 'Venda a prazo', amountCents: 20000, dueDate: '2026-09-15' });
    expect(receivable.status).toBe(201);

    const list = await request(app.getHttpServer())
      .get('/api/finance-entries')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(list.body).toHaveLength(2);

    const paid = await request(app.getHttpServer())
      .post(`/api/finance-entries/${payable.body.id}/pay`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(paid.status).toBe(201);
    expect(paid.body.status).toBe('paid');
    expect(paid.body.paidAt).not.toBeNull();

    const payAgain = await request(app.getHttpServer())
      .post(`/api/finance-entries/${payable.body.id}/pay`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(payAgain.status).toBe(409);

    const canceled = await request(app.getHttpServer())
      .post(`/api/finance-entries/${receivable.body.id}/cancel`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(canceled.status).toBe(201);
    expect(canceled.body.status).toBe('canceled');

    const editCanceled = await request(app.getHttpServer())
      .patch(`/api/finance-entries/${receivable.body.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ amountCents: 100 });
    expect(editCanceled.status).toBe(409);
  });

  it('rejeita conta a receber com fornecedor e conta a pagar com cliente', async () => {
    const tenant = await registerTenant(app, 'financeiro-tipo');

    const invalidReceivable = await request(app.getHttpServer())
      .post('/api/finance-entries')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        type: 'receivable',
        description: 'Errado',
        amountCents: 1000,
        dueDate: '2026-09-01',
        supplierId: '00000000-0000-0000-0000-000000000000',
      });
    expect(invalidReceivable.status).toBe(400);

    const invalidPayable = await request(app.getHttpServer())
      .post('/api/finance-entries')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        type: 'payable',
        description: 'Errado',
        amountCents: 1000,
        dueDate: '2026-09-01',
        customerId: '00000000-0000-0000-0000-000000000000',
      });
    expect(invalidPayable.status).toBe(400);
  });

  it('resumo de fluxo de caixa soma pendentes, vencidas e pagas corretamente', async () => {
    const tenant = await registerTenant(app, 'financeiro-resumo');

    await request(app.getHttpServer())
      .post('/api/finance-entries')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'payable', description: 'Vencida', amountCents: 5000, dueDate: '2020-01-01' });

    await request(app.getHttpServer())
      .post('/api/finance-entries')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'payable', description: 'A vencer', amountCents: 3000, dueDate: '2030-01-01' });

    const receivableToPay = await request(app.getHttpServer())
      .post('/api/finance-entries')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'receivable', description: 'A receber', amountCents: 10000, dueDate: '2030-01-01' });
    await request(app.getHttpServer())
      .post(`/api/finance-entries/${receivableToPay.body.id}/pay`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);

    const payableToPay = await request(app.getHttpServer())
      .post('/api/finance-entries')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ type: 'payable', description: 'Paga', amountCents: 4000, dueDate: '2030-01-01' });
    await request(app.getHttpServer())
      .post(`/api/finance-entries/${payableToPay.body.id}/pay`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);

    const summary = await request(app.getHttpServer())
      .get('/api/finance-entries/summary')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(summary.status).toBe(200);
    expect(summary.body.pendingPayableCents).toBe(8000); // vencida + a vencer
    expect(summary.body.overduePayableCents).toBe(5000);
    expect(summary.body.pendingReceivableCents).toBe(0);
    expect(summary.body.paidReceivableCents).toBe(10000);
    expect(summary.body.paidPayableCents).toBe(4000);
    expect(summary.body.netCents).toBe(6000);
  });

  it('financeiro gerencia contas, mas operador de caixa não acessa', async () => {
    const tenant = await registerTenant(app, 'financeiro-rbac');
    const financeiroToken = await loginAs(app, db, tenant.tenantId, 'financeiro');
    const cashierToken = await loginAs(app, db, tenant.tenantId, 'operador_caixa');

    const createByFinanceiro = await request(app.getHttpServer())
      .post('/api/finance-entries')
      .set('Authorization', `Bearer ${financeiroToken}`)
      .send({ type: 'payable', description: 'Aluguel', amountCents: 200000, dueDate: '2026-10-01' });
    expect(createByFinanceiro.status).toBe(201);

    const listByCashier = await request(app.getHttpServer())
      .get('/api/finance-entries')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(listByCashier.status).toBe(403);

    const createByCashier = await request(app.getHttpServer())
      .post('/api/finance-entries')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ type: 'payable', description: 'Proibido', amountCents: 100, dueDate: '2026-10-01' });
    expect(createByCashier.status).toBe(403);
  });
});
