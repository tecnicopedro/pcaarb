import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { registerTenant } from './helpers/register-tenant';

describe('GET /users/me (e2e)', () => {
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

  it('retorna o usuário logado e o tenant dele', async () => {
    const owner = await registerTenant(app, 'me');

    const response = await request(app.getHttpServer()).get('/api/users/me').set('Authorization', `Bearer ${owner.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(owner.userId);
    expect(response.body.user.role).toBe('owner');
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(response.body.tenant.id).toBe(owner.tenantId);
    expect(response.body.tenant.companyName).toBeTruthy();
  });

  it('rejeita sem token', async () => {
    const response = await request(app.getHttpServer()).get('/api/users/me');
    expect(response.status).toBe(401);
  });
});
