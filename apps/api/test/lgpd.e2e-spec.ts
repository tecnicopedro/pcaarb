import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { registerTenant } from './helpers/register-tenant';
import { openCashSession } from './helpers/open-cash-session';

async function mintUser(app: INestApplication, db: Database, tenantId: string, role: 'admin' | 'operador_caixa') {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
  const passwordHash = await bcrypt.hash('SenhaForte123', 12);
  const [user] = await db.insert(users).values({ tenantId, name: role, email, passwordHash, role }).returning();
  const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'SenhaForte123' });
  return { id: user!.id, accessToken: login.body.accessToken as string };
}

async function createProduct(app: INestApplication, accessToken: string, priceCents: number, name = 'Produto') {
  const response = await request(app.getHttpServer())
    .post('/api/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, priceCents, trackStock: false });
  return response.body.id as string;
}

async function createCustomer(app: INestApplication, accessToken: string, name = 'Cliente Teste') {
  const response = await request(app.getHttpServer())
    .post('/api/customers')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, document: '12345678901', email: 'cliente@pcaarb.test', phone: '11999999999' });
  return response.body.id as string;
}

describe('LGPD — exportação e anonimização de dados pessoais (e2e)', () => {
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

  it('cliente sem histórico é apagado de verdade ao excluir', async () => {
    const tenant = await registerTenant(app, 'lgpd-sem-historico');
    const customerId = await createCustomer(app, tenant.accessToken);

    const remove = await request(app.getHttpServer())
      .delete(`/api/customers/${customerId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(remove.status).toBe(204);

    const list = await request(app.getHttpServer()).get('/api/customers').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(list.body.find((c: { id: string }) => c.id === customerId)).toBeUndefined();
  });

  it('cliente COM histórico (venda + pontos de fidelidade) é anonimizado em vez de apagado ao excluir — não cascateia no ledger', async () => {
    const tenant = await registerTenant(app, 'lgpd-com-historico');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    const customerId = await createCustomer(app, tenant.accessToken);
    await openCashSession(app, tenant.accessToken, 5000);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ customerId, items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });
    expect(sale.body.pointsEarned).toBeGreaterThan(0);

    const remove = await request(app.getHttpServer())
      .delete(`/api/customers/${customerId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(remove.status).toBe(204);

    // Still exists (wasn't deleted), just anonymized — same id, PII cleared.
    const found = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(found.status).toBe(200);
    expect(found.body.name).toBe('Cliente removido');
    expect(found.body.document).toBeNull();
    expect(found.body.email).toBeNull();
    expect(found.body.phone).toBeNull();

    // Loyalty ledger survives intact (didn't cascade) — the sale still has
    // customerId pointing to the same anonymized record.
    const balance = await request(app.getHttpServer())
      .get(`/api/customers/${customerId}/loyalty/balance`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(balance.status).toBe(200);
    expect(balance.body.balancePoints).toBeGreaterThan(0);
  });

  it('POST /data-privacy/customers/:id/anonymize é owner-only e anonimiza sob demanda, com ou sem histórico', async () => {
    const tenant = await registerTenant(app, 'lgpd-anonimizar-sob-demanda');
    const admin = await mintUser(app, db, tenant.tenantId, 'admin');
    const customerId = await createCustomer(app, tenant.accessToken, 'Fulano de Tal');

    const rejected = await request(app.getHttpServer())
      .post(`/api/data-privacy/customers/${customerId}/anonymize`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(rejected.status).toBe(403);

    const anonymized = await request(app.getHttpServer())
      .post(`/api/data-privacy/customers/${customerId}/anonymize`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(anonymized.status).toBe(200);
    expect(anonymized.body.name).toBe('Cliente removido');
  });

  it('GET /data-privacy/customers/:id/export é owner-only e devolve venda/itens/pagamentos/ledger do cliente', async () => {
    const tenant = await registerTenant(app, 'lgpd-exportar');
    const caixa = await mintUser(app, db, tenant.tenantId, 'operador_caixa');
    const productId = await createProduct(app, tenant.accessToken, 2000, 'Produto Exportado');
    const customerId = await createCustomer(app, tenant.accessToken, 'Ciclana Exportável');
    await openCashSession(app, tenant.accessToken, 5000);

    await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ customerId, items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 2000 }] });

    const rejected = await request(app.getHttpServer())
      .get(`/api/data-privacy/customers/${customerId}/export`)
      .set('Authorization', `Bearer ${caixa.accessToken}`);
    expect(rejected.status).toBe(403);

    const exported = await request(app.getHttpServer())
      .get(`/api/data-privacy/customers/${customerId}/export`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(exported.status).toBe(200);
    expect(exported.body.customer.name).toBe('Ciclana Exportável');
    expect(exported.body.sales).toHaveLength(1);
    expect(exported.body.sales[0].items[0].productName).toBe('Produto Exportado');
    expect(exported.body.sales[0].payments[0].amountCents).toBe(2000);
    expect(exported.body.loyaltyLedger.length).toBeGreaterThan(0);
  });

  it('desativar usuário bloqueia login, mas mantém o registro (não apaga) — DELETE /users/:id', async () => {
    const tenant = await registerTenant(app, 'lgpd-desativar-usuario');
    const email = `desativar-${Date.now()}@pcaarb.test`;
    const passwordHash = await bcrypt.hash('SenhaForte123', 12);
    const [target] = await db.insert(users).values({ tenantId: tenant.tenantId, name: 'Alvo', email, passwordHash, role: 'operador_caixa' }).returning();

    // Logs in BEFORE deactivating to capture a real refresh token — it's this
    // token, issued while the account was still active, that needs to stop
    // working afterward (security review finding, 2026-08-19: deactivating
    // only blocked new logins, it didn't revoke an already-open session).
    const priorLogin = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'SenhaForte123' });
    const priorRefreshToken = priorLogin.body.refreshToken as string;

    const deactivate = await request(app.getHttpServer())
      .delete(`/api/users/${target!.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.active).toBe(false);

    const loginAttempt = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'SenhaForte123' });
    expect(loginAttempt.status).toBe(401);

    const refreshAttempt = await request(app.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: priorRefreshToken });
    expect(refreshAttempt.status).toBe(401);

    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, target!.id));
    expect(row).toBeDefined(); // still exists, wasn't deleted
  });

  it('não permite desativar a própria conta nem o último owner ativo do tenant', async () => {
    const tenant = await registerTenant(app, 'lgpd-protecoes-desativacao');

    const selfDeactivate = await request(app.getHttpServer())
      .delete(`/api/users/${tenant.userId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(selfDeactivate.status).toBe(400);

    const admin = await mintUser(app, db, tenant.tenantId, 'admin');
    const adminTriesOwner = await request(app.getHttpServer())
      .delete(`/api/users/${tenant.userId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(adminTriesOwner.status).toBe(403);
  });
});
