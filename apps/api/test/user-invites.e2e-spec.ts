import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { userInvites, users } from '../src/database/schema/index';
import { EMAIL_PROVIDER, type EmailProvider, type SendInviteEmailParams } from '../src/modules/email/email-provider.interface';
import { registerTenant } from './helpers/register-tenant';

function tokenFromInviteUrl(inviteUrl: string): string {
  return new URL(inviteUrl).searchParams.get('token') as string;
}

// Email is globally unique across tenants (users.email), and the e2e tests
// run against a real Postgres with no reset between runs — needs to be
// unique on every run, same pattern as registerTenant().
function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
}

describe('Convite e gestão de usuários (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let lastInvite: SendInviteEmailParams | undefined;

  beforeAll(async () => {
    const recordingEmailProvider: EmailProvider = {
      async sendInvite(params) {
        lastInvite = params;
      },
      async sendPasswordReset() {},
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

  async function loginAsCashier(tenantId: string) {
    const email = `caixa-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
    const passwordHash = await bcrypt.hash('SenhaForte123', 12);
    await db.insert(users).values({ tenantId, name: 'Caixa', email, passwordHash, role: 'operador_caixa' });
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'SenhaForte123' });
    return login.body.accessToken as string;
  }

  it('owner convida um admin, e o convidado aceita e já loga automaticamente', async () => {
    const owner = await registerTenant(app, 'invite-ok');
    const invitedEmail = uniqueEmail('novo-admin');

    const invite = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: invitedEmail, role: 'admin' });
    expect(invite.status).toBe(201);
    expect(invite.body.email).toBe(invitedEmail);
    expect(invite.body.tokenHash).toBeUndefined();
    expect(lastInvite?.to).toBe(invitedEmail);
    expect(lastInvite?.role).toBe('admin');

    const pending = await request(app.getHttpServer())
      .get('/api/users/invites')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(pending.body).toHaveLength(1);

    const token = tokenFromInviteUrl(lastInvite!.inviteUrl);
    const accept = await request(app.getHttpServer()).post('/api/auth/accept-invite').send({
      inviteId: invite.body.id,
      token,
      name: 'Novo Admin',
      password: 'SenhaForte123',
    });
    expect(accept.status).toBe(200);
    expect(accept.body.accessToken).toBeDefined();

    const list = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(list.body).toHaveLength(2);
    expect(list.body.some((u: { email: string; role: string }) => u.email === invitedEmail && u.role === 'admin')).toBe(true);

    const pendingAfter = await request(app.getHttpServer())
      .get('/api/users/invites')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(pendingAfter.body).toHaveLength(0);
  });

  it('rejeita aceite com token errado', async () => {
    const owner = await registerTenant(app, 'invite-token-errado');
    const invite = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: uniqueEmail('alguem'), role: 'operador_caixa' });

    const accept = await request(app.getHttpServer()).post('/api/auth/accept-invite').send({
      inviteId: invite.body.id,
      token: 'token-que-nao-bate-com-o-hash-armazenado',
      name: 'Alguém',
      password: 'SenhaForte123',
    });
    expect(accept.status).toBe(401);
  });

  it('rejeita aceite de convite expirado', async () => {
    const owner = await registerTenant(app, 'invite-expirado');
    const invite = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: uniqueEmail('atrasado'), role: 'operador_caixa' });
    const token = tokenFromInviteUrl(lastInvite!.inviteUrl);

    await db.update(userInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(userInvites.id, invite.body.id));

    const accept = await request(app.getHttpServer()).post('/api/auth/accept-invite').send({
      inviteId: invite.body.id,
      token,
      name: 'Atrasado',
      password: 'SenhaForte123',
    });
    expect(accept.status).toBe(410);
  });

  it('rejeita aceitar o mesmo convite duas vezes', async () => {
    const owner = await registerTenant(app, 'invite-duplo');
    const invite = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: uniqueEmail('duplo'), role: 'operador_caixa' });
    const token = tokenFromInviteUrl(lastInvite!.inviteUrl);

    const first = await request(app.getHttpServer()).post('/api/auth/accept-invite').send({
      inviteId: invite.body.id,
      token,
      name: 'Duplo',
      password: 'SenhaForte123',
    });
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer()).post('/api/auth/accept-invite').send({
      inviteId: invite.body.id,
      token,
      name: 'Duplo',
      password: 'SenhaForte123',
    });
    expect(second.status).toBe(409);
  });

  it('convite revogado não pode mais ser aceito', async () => {
    const owner = await registerTenant(app, 'invite-revogado');
    const invite = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: uniqueEmail('revogado'), role: 'operador_caixa' });
    const token = tokenFromInviteUrl(lastInvite!.inviteUrl);

    const revoke = await request(app.getHttpServer())
      .delete(`/api/users/invites/${invite.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(revoke.status).toBe(204);

    const accept = await request(app.getHttpServer()).post('/api/auth/accept-invite').send({
      inviteId: invite.body.id,
      token,
      name: 'Revogado',
      password: 'SenhaForte123',
    });
    expect(accept.status).toBe(404);
  });

  it('operador de caixa e financeiro não podem convidar nem listar usuários', async () => {
    const owner = await registerTenant(app, 'invite-rbac');
    const cashierToken = await loginAsCashier(owner.tenantId);

    const invite = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ email: uniqueEmail('x'), role: 'operador_caixa' });
    expect(invite.status).toBe(403);

    const list = await request(app.getHttpServer()).get('/api/users').set('Authorization', `Bearer ${cashierToken}`);
    expect(list.status).toBe(403);
  });

  it('admin não pode convidar outro usuário como owner', async () => {
    const owner = await registerTenant(app, 'invite-owner-guard');
    const inviteAdmin = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: uniqueEmail('admin-guard'), role: 'admin' });
    const token = tokenFromInviteUrl(lastInvite!.inviteUrl);
    const accept = await request(app.getHttpServer()).post('/api/auth/accept-invite').send({
      inviteId: inviteAdmin.body.id,
      token,
      name: 'Admin Guard',
      password: 'SenhaForte123',
    });
    const adminToken = accept.body.accessToken as string;

    const inviteOwner = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: uniqueEmail('outro-owner'), role: 'owner' });
    expect(inviteOwner.status).toBe(403);
  });

  it('não permite rebaixar o único owner do tenant', async () => {
    const owner = await registerTenant(app, 'invite-last-owner');

    const demote = await request(app.getHttpServer())
      .patch(`/api/users/${owner.userId}/role`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ role: 'admin' });
    expect(demote.status).toBe(409);
  });

  it('admin não pode rebaixar um owner, mesmo havendo mais de um owner no tenant', async () => {
    const owner = await registerTenant(app, 'invite-admin-nao-rebaixa-owner');

    const inviteSecondOwner = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: uniqueEmail('segundo-owner'), role: 'owner' });
    const secondOwnerToken = tokenFromInviteUrl(lastInvite!.inviteUrl);
    await request(app.getHttpServer()).post('/api/auth/accept-invite').send({
      inviteId: inviteSecondOwner.body.id,
      token: secondOwnerToken,
      name: 'Segundo Owner',
      password: 'SenhaForte123',
    });

    const inviteAdmin = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: uniqueEmail('admin-tentando-rebaixar'), role: 'admin' });
    const adminToken = tokenFromInviteUrl(lastInvite!.inviteUrl);
    const acceptAdmin = await request(app.getHttpServer()).post('/api/auth/accept-invite').send({
      inviteId: inviteAdmin.body.id,
      token: adminToken,
      name: 'Admin',
      password: 'SenhaForte123',
    });
    const adminAccessToken = acceptAdmin.body.accessToken as string;

    // At this point the tenant has 2 owners — the "last owner" check alone
    // would let this through. The block has to come from "only an owner touches an owner".
    const demote = await request(app.getHttpServer())
      .patch(`/api/users/${owner.userId}/role`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ role: 'admin' });
    expect(demote.status).toBe(403);
  });

  it('usuário rebaixado de owner não consegue se auto-promover de volta com o access token antigo', async () => {
    const owner = await registerTenant(app, 'invite-sem-reauto-promocao');

    const inviteSecondOwner = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: uniqueEmail('sera-rebaixado'), role: 'owner' });
    const secondOwnerToken = tokenFromInviteUrl(lastInvite!.inviteUrl);
    const acceptSecondOwner = await request(app.getHttpServer()).post('/api/auth/accept-invite').send({
      inviteId: inviteSecondOwner.body.id,
      token: secondOwnerToken,
      name: 'Será Rebaixado',
      password: 'SenhaForte123',
    });
    // Access token issued while the user was still owner — their role claim
    // becomes stale as soon as the first owner demotes them.
    const staleOwnerAccessToken = acceptSecondOwner.body.accessToken as string;
    const staleOwnerId = JSON.parse(Buffer.from(staleOwnerAccessToken.split('.')[1], 'base64').toString()).sub;

    const demote = await request(app.getHttpServer())
      .patch(`/api/users/${staleOwnerId}/role`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ role: 'admin' });
    expect(demote.status).toBe(200);

    const selfPromote = await request(app.getHttpServer())
      .patch(`/api/users/${staleOwnerId}/role`)
      .set('Authorization', `Bearer ${staleOwnerAccessToken}`)
      .send({ role: 'owner' });
    expect(selfPromote.status).toBe(403);
  });

  it('promove e rebaixa usuário quando não é o último owner', async () => {
    const owner = await registerTenant(app, 'invite-promote');
    const inviteAdmin = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: uniqueEmail('promovido'), role: 'operador_caixa' });
    const token = tokenFromInviteUrl(lastInvite!.inviteUrl);
    const accept = await request(app.getHttpServer()).post('/api/auth/accept-invite').send({
      inviteId: inviteAdmin.body.id,
      token,
      name: 'Promovido',
      password: 'SenhaForte123',
    });
    const accessTokenPayload = JSON.parse(Buffer.from(accept.body.accessToken.split('.')[1], 'base64').toString());

    const promote = await request(app.getHttpServer())
      .patch(`/api/users/${accessTokenPayload.sub}/role`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ role: 'financeiro' });
    expect(promote.status).toBe(200);
    expect(promote.body.role).toBe('financeiro');
  });
});

describe('Convite — provedor de e-mail indisponível (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    const failingEmailProvider: EmailProvider = {
      async sendInvite() {
        throw new Error('Resend fora do ar (simulado)');
      },
      async sendPasswordReset() {},
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_PROVIDER)
      .useValue(failingEmailProvider)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get(DRIZZLE);
  });

  afterAll(async () => {
    await app.close();
  });

  it('falha no envio do e-mail desfaz o convite inteiro — nada fica orfão no banco', async () => {
    const owner = await registerTenant(app, 'invite-email-falho');
    const email = uniqueEmail('sem-entrega');

    const invite = await request(app.getHttpServer())
      .post('/api/users/invite')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email, role: 'operador_caixa' });
    expect(invite.status).toBe(500);

    const rows = await db.select().from(userInvites).where(eq(userInvites.email, email));
    expect(rows).toHaveLength(0);

    const pending = await request(app.getHttpServer())
      .get('/api/users/invites')
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(pending.body).toHaveLength(0);
  });
});
