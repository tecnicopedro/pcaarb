import { randomInt } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export async function registerTenant(app: INestApplication, label: string) {
  // CPF tem 11 dígitos — sorteia no espaço inteiro (não deriva de Date.now())
  // pra não colidir quando vários arquivos de teste rodam em paralelo e
  // chamam isto na mesma janela de milissegundos.
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
    tenantId: accessTokenPayload.tenantId as string,
    userId: accessTokenPayload.sub as string,
  };
}
