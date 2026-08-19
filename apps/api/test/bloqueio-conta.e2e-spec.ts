import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { registerTenant } from './helpers/register-tenant';

// Kept as a separate file from recuperacao-senha.e2e-spec.ts on purpose: each
// test file gets its own application instance (its own in-memory rate-limit
// count from ThrottlerGuard), and testing account lockout requires several
// real calls to POST /auth/login — splitting it avoids hitting the endpoint's
// 5/min limit from pure accumulation of unrelated tests in the same file.
// Attempt state is always seeded directly in the database when the test
// doesn't need to validate the INCREMENT itself, only the behavior at an
// already-known count (same rationale as mintUser in
// fidelidade.e2e-spec.ts) — keeps the total number of real login calls per
// file well below the limit.
describe('Bloqueio de conta por tentativas de login (e2e)', () => {
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

  it('a 5ª tentativa errada bloqueia a conta por um período', async () => {
    const tenant = await registerTenant(app, 'bloqueio-limiar');
    await db.update(users).set({ failedLoginAttempts: 4 }).where(eq(users.email, tenant.email));

    const fifthAttempt = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: tenant.email, password: 'SenhaErrada000' });
    expect(fifthAttempt.status).toBe(401);

    const [locked] = await db.select({ lockedUntil: users.lockedUntil }).from(users).where(eq(users.email, tenant.email));
    expect(locked?.lockedUntil).not.toBeNull();
    expect(locked!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  // Security review finding (2026-08-19): the "locked" message only appeared
  // when the submitted password was CORRECT (the lockout branch was only
  // reached after passwordMatches === true) — an attacker with a leaked
  // credential could confirm the password was correct by sending it against
  // an already-locked account, without ever completing a real login. Fixed by
  // checking the lockout before the password decides the response, with the
  // same message in both cases.
  it('a mensagem de bloqueio é idêntica com senha certa ou errada — não é um oráculo de acerto de senha', async () => {
    const tenant = await registerTenant(app, 'bloqueio-oraculo');
    await db
      .update(users)
      .set({ failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) })
      .where(eq(users.email, tenant.email));

    const wrongPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: tenant.email, password: 'SenhaErradaQualquer' });
    const correctPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: tenant.email, password: tenant.password });

    expect(wrongPassword.status).toBe(401);
    expect(correctPassword.status).toBe(401);
    expect(wrongPassword.body.message).toBe(correctPassword.body.message);
    expect(wrongPassword.body.message).toMatch(/bloqueada/i);
  });

  it('login bem-sucedido zera o contador de tentativas erradas', async () => {
    const tenant = await registerTenant(app, 'zera-contador');
    await db.update(users).set({ failedLoginAttempts: 3 }).where(eq(users.email, tenant.email));

    const ok = await request(app.getHttpServer()).post('/api/auth/login').send({ email: tenant.email, password: tenant.password });
    expect(ok.status).toBe(200);

    const [user] = await db.select({ failedLoginAttempts: users.failedLoginAttempts }).from(users).where(eq(users.email, tenant.email));
    expect(user?.failedLoginAttempts).toBe(0);
  });
});
