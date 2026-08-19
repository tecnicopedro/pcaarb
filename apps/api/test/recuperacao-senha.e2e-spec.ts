import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { passwordResetTokens } from '../src/database/schema/index';
import { EMAIL_PROVIDER, type EmailProvider, type SendPasswordResetEmailParams } from '../src/modules/email/email-provider.interface';
import { registerTenant } from './helpers/register-tenant';

function tokenFromResetUrl(resetUrl: string): { id: string; token: string } {
  const url = new URL(resetUrl);
  return { id: url.searchParams.get('id') as string, token: url.searchParams.get('token') as string };
}

describe('Recuperação de senha (e2e)', () => {
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

  it('fluxo feliz: pede reset, troca a senha, senha antiga para de funcionar e refresh token antigo é revogado', async () => {
    const tenant = await registerTenant(app, 'reset-feliz');
    lastReset = undefined;

    const forgot = await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: tenant.email });
    expect(forgot.status).toBe(204);
    expect(lastReset?.to).toBe(tenant.email);

    const { id, token } = tokenFromResetUrl(lastReset!.resetUrl);
    const reset = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ id, token, password: 'NovaSenhaForte456' });
    expect(reset.status).toBe(204);

    const oldPasswordLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: tenant.email, password: tenant.password });
    expect(oldPasswordLogin.status).toBe(401);

    const newPasswordLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: tenant.email, password: 'NovaSenhaForte456' });
    expect(newPasswordLogin.status).toBe(200);

    const oldRefresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: tenant.refreshToken });
    expect(oldRefresh.status).toBe(401);
  });

  it('token de reset expirado é rejeitado', async () => {
    const tenant = await registerTenant(app, 'reset-expirado');
    await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: tenant.email });
    const { id, token } = tokenFromResetUrl(lastReset!.resetUrl);

    await db.update(passwordResetTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(passwordResetTokens.id, id));

    const reset = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ id, token, password: 'OutraSenhaForte789' });
    expect(reset.status).toBe(410);
  });

  it('token de reset já usado é rejeitado na segunda tentativa', async () => {
    const tenant = await registerTenant(app, 'reset-reuso');
    await request(app.getHttpServer()).post('/api/auth/forgot-password').send({ email: tenant.email });
    const { id, token } = tokenFromResetUrl(lastReset!.resetUrl);

    const first = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ id, token, password: 'PrimeiraTroca123' });
    expect(first.status).toBe(204);

    const second = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ id, token, password: 'SegundaTroca456' });
    expect(second.status).toBe(409);
  });

  it('e-mail inexistente responde 204 igual a um e-mail existente — sem oráculo de enumeração', async () => {
    lastReset = undefined;
    const forgot = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: 'ninguem-com-esse-email@pcaarb.test' });
    expect(forgot.status).toBe(204);
    expect(lastReset).toBeUndefined();
  });
});
