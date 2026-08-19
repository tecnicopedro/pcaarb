import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export async function registerTenant(app: INestApplication, label: string) {
  // CPF has 11 digits — draw from the full range (don't derive from Date.now())
  // so it doesn't collide when several test files run in parallel and call
  // this within the same millisecond window.
  const document = String(randomInt(0, 100_000_000_000)).padStart(11, '0');
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
  const response = await request(app.getHttpServer()).post('/api/auth/register').send({
    companyName: `Loja ${label}`,
    document,
    ownerName: `Dono ${label}`,
    ownerEmail: email,
    password: 'SenhaForte123',
  });
  const accessTokenPayload = JSON.parse(
    Buffer.from(response.body.accessToken.split('.')[1], 'base64').toString(),
  );
  return {
    accessToken: response.body.accessToken as string,
    refreshToken: response.body.refreshToken as string,
    tenantId: accessTokenPayload.tenantId as string,
    userId: accessTokenPayload.sub as string,
    email,
    password: 'SenhaForte123',
  };
}
