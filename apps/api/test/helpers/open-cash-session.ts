import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

// Toda venda exige uma loja desde a Fase 3 (multi-loja) — busca a loja do
// próprio tenant do accessToken (todo tenant nasce com uma, ver
// TenantsService.registerWithOwner) em vez de cada teste precisar
// descobrir/guardar o storeId manualmente.
export async function openCashSession(app: INestApplication, accessToken: string, openingAmountCents = 0) {
  const stores = await request(app.getHttpServer()).get('/api/stores').set('Authorization', `Bearer ${accessToken}`);
  const storeId = stores.body[0].id as string;
  return request(app.getHttpServer())
    .post('/api/cash-sessions')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ storeId, openingAmountCents });
}
