import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { buildCorsOptions } from '../src/cors.config';
import { registerTenant } from './helpers/register-tenant';

describe('CORS (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableCors(buildCorsOptions('http://localhost:3000'));
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('expõe Content-Disposition entre origens — sem isso o front não lê o nome do arquivo de um download', async () => {
    const tenant = await registerTenant(app, 'cors-export');

    const response = await request(app.getHttpServer())
      .get('/api/reports/exportar/vendas.csv')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .set('Origin', 'http://localhost:3000');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-expose-headers']).toContain('Content-Disposition');
  });
});
