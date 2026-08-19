import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import type { Env } from '../src/config/env.validation';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { EMAIL_PROVIDER, type EmailProvider } from '../src/modules/email/email-provider.interface';
import { registerTenant } from './helpers/register-tenant';

// This file creates far more users than the other specs (RBAC + scope +
// isolation, across several tests) — running all of them through a real
// POST /auth/login would blow past the login rate limit (5/min, deliberately
// tight against brute force). Signing the token directly with the same
// secret/payload that AuthService.issueTokens uses reproduces exactly what
// login would emit, without depending on the endpoint (or the password flow,
// which isn't what this file tests).
async function mintUser(app: INestApplication, db: Database, tenantId: string, role: 'financeiro' | 'operador_caixa' | 'admin') {
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

async function findOwnerId(db: Database, tenantId: string): Promise<string> {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, 'owner')));
  return owner!.id;
}

describe('Permissões granulares por usuário (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    // This file tests permission overrides, not the email sending itself
    // (that's already covered in user-invites.e2e-spec.ts) — without this,
    // the invite test below would depend on a real Resend account configured
    // in RESEND_API_KEY just to pass, which would break in CI (with no such
    // secret) and is fragile even locally (the third-party key's rate
    // limit/expiration bringing down a test that has nothing to do with email).
    const fakeEmailProvider: EmailProvider = { async sendInvite() {}, async sendPasswordReset() {} };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(fakeEmailProvider)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get(DRIZZLE);
  });

  afterAll(async () => {
    await app.close();
  });

  it('override "allow" concede acesso extra a um operador de caixa, além do papel base', async () => {
    const tenant = await registerTenant(app, 'perm-allow');
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');

    const before = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(before.status).toBe(403);

    const grant = await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'Report', action: 'read', effect: 'allow' });
    expect(grant.status).toBe(201);
    expect(grant.body.effect).toBe('allow');

    const after = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(after.status).toBe(200);

    // The rest of the operador_caixa role remains intact — it hasn't become a different role.
    const stillBlocked = await request(app.getHttpServer())
      .get('/api/finance-entries')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(stillBlocked.status).toBe(403);
  });

  it('override "deny" revoga acesso que o papel base concederia a um admin', async () => {
    const tenant = await registerTenant(app, 'perm-deny');
    const admin = await mintUser(app, db, tenant.tenantId, 'admin');

    const before = await request(app.getHttpServer())
      .get('/api/finance-entries')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(before.status).toBe(200);

    const deny = await request(app.getHttpServer())
      .post(`/api/users/${admin.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'FinanceEntry', action: 'manage', effect: 'deny' });
    expect(deny.status).toBe(201);

    const after = await request(app.getHttpServer())
      .get('/api/finance-entries')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(after.status).toBe(403);

    // The rest of the admin role remains intact.
    const stillAllowed = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(stillAllowed.status).toBe(200);
  });

  it('criar de novo pro mesmo (subject, action) substitui a regra anterior (upsert)', async () => {
    const tenant = await registerTenant(app, 'perm-upsert');
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');

    await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'Report', action: 'read', effect: 'allow' });

    const allowed = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(allowed.status).toBe(200);

    await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'Report', action: 'read', effect: 'deny' });

    const list = await request(app.getHttpServer())
      .get(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].effect).toBe('deny');

    const blockedAgain = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(blockedAgain.status).toBe(403);
  });

  it('excluir um override volta o usuário pro default do papel', async () => {
    const tenant = await registerTenant(app, 'perm-remove');
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');

    const grant = await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'Report', action: 'read', effect: 'allow' });

    const remove = await request(app.getHttpServer())
      .delete(`/api/users/${cashier.id}/permission-overrides/${grant.body.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(remove.status).toBe(204);

    const backToDefault = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo')
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(backToDefault.status).toBe(403);
  });

  it('owner nunca pode ser alvo de override — mantém acesso total garantido', async () => {
    const tenant = await registerTenant(app, 'perm-owner');
    const ownerId = await findOwnerId(db, tenant.tenantId);

    const attempt = await request(app.getHttpServer())
      .post(`/api/users/${ownerId}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'User', action: 'delete', effect: 'deny' });
    expect(attempt.status).toBe(400);
  });

  it('override de um usuário nunca vaza para outro usuário do mesmo tenant', async () => {
    const tenant = await registerTenant(app, 'perm-escopo-usuario');
    const cashierA = await mintUser(app, db, tenant.tenantId, 'operador_caixa');
    const cashierB = await mintUser(app, db, tenant.tenantId, 'operador_caixa');

    await request(app.getHttpServer())
      .post(`/api/users/${cashierA.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'Report', action: 'read', effect: 'allow' });

    const aCanRead = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo')
      .set('Authorization', `Bearer ${cashierA.accessToken}`);
    expect(aCanRead.status).toBe(200);

    const bStillBlocked = await request(app.getHttpServer())
      .get('/api/reports/vendas-resumo')
      .set('Authorization', `Bearer ${cashierB.accessToken}`);
    expect(bStillBlocked.status).toBe(403);
  });

  it('overrides não vazam entre tenants diferentes (isolamento)', async () => {
    const tenantA = await registerTenant(app, 'perm-iso-a');
    const tenantB = await registerTenant(app, 'perm-iso-b');
    const cashierA = await mintUser(app, db, tenantA.tenantId, 'operador_caixa');

    await request(app.getHttpServer())
      .post(`/api/users/${cashierA.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ subject: 'Report', action: 'read', effect: 'allow' });

    // Tenant B can't see (or manage) another tenant's user.
    const crossTenantList = await request(app.getHttpServer())
      .get(`/api/users/${cashierA.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(crossTenantList.status).toBe(404);

    const crossTenantCreate = await request(app.getHttpServer())
      .post(`/api/users/${cashierA.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenantB.accessToken}`)
      .send({ subject: 'FinanceEntry', action: 'manage', effect: 'allow' });
    expect(crossTenantCreate.status).toBe(404);
  });

  it('financeiro e operador de caixa não podem gerenciar overrides — só admin/owner', async () => {
    const tenant = await registerTenant(app, 'perm-rbac');
    const financeiro = await mintUser(app, db, tenant.tenantId, 'financeiro');
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');

    const byFinanceiro = await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${financeiro.accessToken}`)
      .send({ subject: 'Report', action: 'read', effect: 'allow' });
    expect(byFinanceiro.status).toBe(403);

    const byCashier = await request(app.getHttpServer())
      .get(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${cashier.accessToken}`);
    expect(byCashier.status).toBe(403);
  });

  it('rejeita subject fora da lista permitida (sem escalar pra "all"/"Tenant")', async () => {
    const tenant = await registerTenant(app, 'perm-subject-invalido');
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');

    const attempt = await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'all', action: 'manage', effect: 'allow' });
    expect(attempt.status).toBe(400);

    const attemptTenant = await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'Tenant', action: 'manage', effect: 'allow' });
    expect(attemptTenant.status).toBe(400);

    const attemptUserAccess = await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'UserAccess', action: 'update', effect: 'allow' });
    expect(attemptUserAccess.status).toBe(400);

    // Security review finding (2026-08-18): 'Integration' guards
    // POST /api-keys, which mints a durable credential with the requested
    // role. A seemingly narrow override on 'Integration' (which sounds
    // harmless, like "let them configure the marketplace integration")
    // turned into a path for a financeiro/operador_caixa to mint an API key
    // with role:'admin'.
    const attemptIntegration = await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'Integration', action: 'create', effect: 'allow' });
    expect(attemptIntegration.status).toBe(400);
  });

  it('override em "User" (leitura de identidade) não permite escalonamento via convite/troca de papel', async () => {
    const tenant = await registerTenant(app, 'perm-escalonamento');
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');

    // Admin grants something that looks narrow: update:User.
    const grant = await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'User', action: 'update', effect: 'allow' });
    expect(grant.status).toBe(201);

    // Doesn't unlock self-promoting to admin...
    const escalateRole = await request(app.getHttpServer())
      .patch(`/api/users/${cashier.id}/role`)
      .set('Authorization', `Bearer ${cashier.accessToken}`)
      .send({ role: 'admin' });
    expect(escalateRole.status).toBe(403);

    // ...nor inviting a new user already as admin...
    const escalateInvite = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${cashier.accessToken}`)
      .send({ email: `escalonamento-${Date.now()}@pcaarb.test`, role: 'admin' });
    expect(escalateInvite.status).toBe(403);

    // ...nor managing other users' overrides (meta-escalation).
    const escalateOverrides = await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${cashier.accessToken}`)
      .send({ subject: 'FinanceEntry', action: 'manage', effect: 'allow' });
    expect(escalateOverrides.status).toBe(403);
  });

  it('a invariante de "sempre existe ao menos um owner" continua intacta com o novo módulo', async () => {
    const tenant = await registerTenant(app, 'perm-invariante-owner');
    const ownerId = await findOwnerId(db, tenant.tenantId);

    const demote = await request(app.getHttpServer())
      .patch(`/api/users/${ownerId}/role`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ role: 'admin' });
    expect(demote.status).toBe(409);
  });
});
