import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde ok', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('fluxo completo: registrar tenant, logar e reutilizar refresh token', async () => {
    const document = String(Date.now()).padStart(11, '0').slice(-11);
    const email = `owner-${Date.now()}@pcaarb.test`;

    const register = await request(app.getHttpServer()).post('/api/auth/register').send({
      companyName: 'Loja de Teste',
      document,
      ownerName: 'Dona da Loja',
      ownerEmail: email,
      password: 'SenhaForte123',
    });
    expect(register.status).toBe(201);
    expect(register.body.accessToken).toBeDefined();
    expect(register.body.refreshToken).toBeDefined();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'SenhaForte123' });
    expect(login.status).toBe(200);

    const refresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toBeDefined();
  });
});
