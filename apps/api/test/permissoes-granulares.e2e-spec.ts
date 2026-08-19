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

// Este arquivo cria bem mais usuários que os outros specs (RBAC + escopo +
// isolamento, em vários testes) — passar todos pelo POST /auth/login de
// verdade estouraria o rate limit de login (5/min, deliberadamente apertado
// contra força bruta). Assinar o token direto com o mesmo segredo/payload que
// AuthService.issueTokens usa reproduz exatamente o que login emitiria, sem
// depender do endpoint (nem do fluxo de senha, que não é o que este arquivo testa).
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
    // Este arquivo testa override de permissão, não o envio de e-mail em si
    // (isso já é coberto em user-invites.e2e-spec.ts) — sem isso, o teste de
    // convite abaixo dependeria de uma conta Resend real configurada em
    // RESEND_API_KEY só pra passar, o que quebraria em CI (sem esse segredo)
    // e é frágil mesmo localmente (rate limit/expiração da chave de terceiro
    // derrubando um teste que não tem nada a ver com e-mail).
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

    // Resto do papel de operador de caixa continua intacto — não virou outro papel.
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

    // Resto do papel de admin continua intacto.
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

    // Tenant B não enxerga (nem consegue gerenciar) usuário de outro tenant.
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

    // Achado de revisão de segurança (2026-08-18): 'Integration' guarda
    // POST /api-keys, que minta uma credencial durável com o role pedido.
    // Um override pontual de 'Integration' (que soa inócuo, tipo "deixa
    // configurar a integração do marketplace") virava caminho pra um
    // financeiro/operador_caixa mintar uma chave de API com role:'admin'.
    const attemptIntegration = await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'Integration', action: 'create', effect: 'allow' });
    expect(attemptIntegration.status).toBe(400);
  });

  it('override em "User" (leitura de identidade) não permite escalonamento via convite/troca de papel', async () => {
    const tenant = await registerTenant(app, 'perm-escalonamento');
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');

    // Admin concede algo aparentemente pontual: update:User.
    const grant = await request(app.getHttpServer())
      .post(`/api/users/${cashier.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ subject: 'User', action: 'update', effect: 'allow' });
    expect(grant.status).toBe(201);

    // Não destrava se auto-promover a admin...
    const escalateRole = await request(app.getHttpServer())
      .patch(`/api/users/${cashier.id}/role`)
      .set('Authorization', `Bearer ${cashier.accessToken}`)
      .send({ role: 'admin' });
    expect(escalateRole.status).toBe(403);

    // ...nem convidar um novo usuário já como admin...
    const escalateInvite = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${cashier.accessToken}`)
      .send({ email: `escalonamento-${Date.now()}@pcaarb.test`, role: 'admin' });
    expect(escalateInvite.status).toBe(403);

    // ...nem gerenciar overrides de outros usuários (meta-escalonamento).
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
