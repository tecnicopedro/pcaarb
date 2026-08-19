import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import type { Env } from '../src/config/env.validation';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { EMAIL_PROVIDER, type EmailProvider, type SendPasswordResetEmailParams } from '../src/modules/email/email-provider.interface';
import { registerTenant } from './helpers/register-tenant';
import { openCashSession } from './helpers/open-cash-session';

// Signs the JWT directly (same pattern as fidelidade.e2e-spec.ts and
// permissoes-granulares.e2e-spec.ts) instead of calling POST /auth/login —
// avoids spending the login's 5/min rate limit on test users that only need
// a valid token, leaving that budget for tests that actually exercise the
// login flow (password reset, account lockout).
async function mintUser(app: INestApplication, db: Database, tenantId: string, role: 'admin' | 'operador_caixa' | 'financeiro') {
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

function tokenFromResetUrl(resetUrl: string): { id: string; token: string } {
  const url = new URL(resetUrl);
  return { id: url.searchParams.get('id') as string, token: url.searchParams.get('token') as string };
}

describe('Log de auditoria (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let lastReset: SendPasswordResetEmailParams | undefined;

  beforeAll(async () => {
    const recordingEmailProvider: EmailProvider = {
      async sendInvite() {},
      async sendPasswordReset(params) {
        lastReset = params;
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(recordingEmailProvider)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get(DRIZZLE);
  });

  afterAll(async () => {
    await app.close();
  });

  it('só owner lê o log de auditoria — admin/financeiro/operador de caixa são rejeitados', async () => {
    const tenant = await registerTenant(app, 'auditoria-rbac');
    const admin = await mintUser(app, db, tenant.tenantId, 'admin');
    const financeiro = await mintUser(app, db, tenant.tenantId, 'financeiro');
    const caixa = await mintUser(app, db, tenant.tenantId, 'operador_caixa');

    const ownerList = await request(app.getHttpServer()).get('/api/audit-logs').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(ownerList.status).toBe(200);

    for (const nonOwner of [admin, financeiro, caixa]) {
      const res = await request(app.getHttpServer()).get('/api/audit-logs').set('Authorization', `Bearer ${nonOwner.accessToken}`);
      expect(res.status).toBe(403);
    }
  });

  it('troca de papel de usuário registra um evento com ator, alvo e o novo papel (controller-level, não-atômico)', async () => {
    const tenant = await registerTenant(app, 'auditoria-papel');
    const target = await mintUser(app, db, tenant.tenantId, 'operador_caixa');

    const update = await request(app.getHttpServer())
      .patch(`/api/users/${target.id}/role`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ role: 'financeiro' });
    expect(update.status).toBe(200);

    const logs = await request(app.getHttpServer()).get('/api/audit-logs').set('Authorization', `Bearer ${tenant.accessToken}`);
    const entry = logs.body.find((l: { action: string }) => l.action === 'user.role_updated');
    expect(entry).toBeDefined();
    expect(entry.actorUserId).toBe(tenant.userId);
    expect(entry.targetType).toBe('User');
    expect(entry.targetId).toBe(target.id);
    expect(entry.metadata).toEqual({ newRole: 'financeiro' });
  });

  it('devolução de venda registra um evento atômico com a mesma transação (service-level via recordTx)', async () => {
    const tenant = await registerTenant(app, 'auditoria-devolucao');
    const productId = await createProduct(app, tenant.accessToken, 1000);
    await openCashSession(app, tenant.accessToken, 5000);

    const sale = await request(app.getHttpServer())
      .post('/api/sales')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ items: [{ productId, quantity: 1 }], payments: [{ method: 'dinheiro', amountCents: 1000 }] });
    const saleItemId = sale.body.items[0].id as string;

    const ret = await request(app.getHttpServer())
      .post(`/api/sales/${sale.body.id}/returns`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ refundMethod: 'dinheiro', reason: 'Teste de auditoria', items: [{ saleItemId, quantity: 1 }] });
    expect(ret.status).toBe(201);

    const logs = await request(app.getHttpServer()).get('/api/audit-logs').set('Authorization', `Bearer ${tenant.accessToken}`);
    const entry = logs.body.find((l: { action: string }) => l.action === 'sale_return.created');
    expect(entry).toBeDefined();
    expect(entry.targetType).toBe('Sale');
    expect(entry.targetId).toBe(sale.body.id);
    expect(entry.metadata.saleReturnId).toBe(ret.body.id);
  });

  it('reset de senha registra um evento atômico com o próprio usuário como ator (auto-serviço)', async () => {
    const tenant = await registerTenant(app, 'auditoria-reset');
    lastReset = undefined;

    await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: tenant.email });
    const { id, token } = tokenFromResetUrl(lastReset!.resetUrl);
    const reset = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ id, token, password: 'NovaSenhaAuditoria123' });
    expect(reset.status).toBe(204);

    const logs = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: tenant.email, password: 'NovaSenhaAuditoria123' })
      .then((login) => request(app.getHttpServer()).get('/api/audit-logs').set('Authorization', `Bearer ${login.body.accessToken}`));
    const entry = logs.body.find((l: { action: string }) => l.action === 'auth.password_reset');
    expect(entry).toBeDefined();
    expect(entry.actorUserId).toBe(tenant.userId);
    expect(entry.targetType).toBe('User');
    expect(entry.targetId).toBe(tenant.userId);
  });

  it('bloqueio de conta por tentativas erradas registra um evento sem ator (ninguém autenticado)', async () => {
    const tenant = await registerTenant(app, 'auditoria-bloqueio');
    await db.update(users).set({ failedLoginAttempts: 4 }).where(eq(users.email, tenant.email));

    await request(app.getHttpServer()).post('/api/auth/login').send({ email: tenant.email, password: 'SenhaErrada000' });

    const logs = await request(app.getHttpServer()).get('/api/audit-logs').set('Authorization', `Bearer ${tenant.accessToken}`);
    const entry = logs.body.find((l: { action: string }) => l.action === 'auth.account_locked');
    expect(entry).toBeDefined();
    expect(entry.actorUserId).toBeNull();
    expect(entry.targetType).toBe('User');
    expect(entry.targetId).toBe(tenant.userId);
  });

  it('isola entradas do log de auditoria entre tenants diferentes (RLS)', async () => {
    const tenantA = await registerTenant(app, 'auditoria-isola-a');
    const tenantB = await registerTenant(app, 'auditoria-isola-b');
    const targetA = await mintUser(app, db, tenantA.tenantId, 'operador_caixa');

    await request(app.getHttpServer())
      .patch(`/api/users/${targetA.id}/role`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ role: 'financeiro' });

    const logsB = await request(app.getHttpServer()).get('/api/audit-logs').set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(logsB.body.every((l: { targetId: string }) => l.targetId !== targetA.id)).toBe(true);
  });
});
