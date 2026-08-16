import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export async function registerTenant(app: INestApplication, label: string) {
  const document = String(Date.now() + Math.floor(Math.random() * 1000)).padStart(11, '0').slice(-11);
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
    tenantId: accessTokenPayload.tenantId as string,
    userId: accessTokenPayload.sub as string,
  };
}
