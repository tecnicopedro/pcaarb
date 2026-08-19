import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { registerTenant } from './helpers/register-tenant';

// Arquivo separado de recuperacao-senha.e2e-spec.ts de propósito: cada
// arquivo de teste ganha sua própria instância da aplicação (própria
// contagem de rate-limit em memória do ThrottlerGuard), e testar bloqueio de
// conta precisa de várias chamadas reais a POST /auth/login — dividir evita
// esbarrar no limite de 5/min do endpoint por puro acúmulo de testes não
// relacionados no mesmo arquivo. Estado de tentativas é sempre semeado direto
// no banco quando o teste não precisa validar o INCREMENTO em si, só o
// comportamento numa quantidade já conhecida (mesmo racional de mintUser em
// fidelidade.e2e-spec.ts) — mantém o total de chamadas reais de login por
// arquivo bem abaixo do limite.
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

  // Achado de revisão de segurança (2026-08-19): a mensagem de "bloqueada" só
  // aparecia quando a senha submetida estava CERTA (o branch de lockout só
  // era alcançado depois de passwordMatches === true) — um atacante com uma
  // credencial vazada conseguia confirmar que a senha estava certa mandando
  // ela contra uma conta já bloqueada, sem nunca completar um login de
  // verdade. Corrigido checando o bloqueio antes da senha decidir a resposta,
  // com a mesma mensagem nos dois casos.
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
