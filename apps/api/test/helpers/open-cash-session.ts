import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

// Every sale has required a store since Phase 3 (multi-store) — fetches the
// store belonging to the accessToken's own tenant (every tenant is born with
// one, see TenantsService.registerWithOwner) instead of each test having to
// discover/store the storeId manually.
export async function openCashSession(app: INestApplication, accessToken: string, openingAmountCents = 0) {
  const stores = await request(app.getHttpServer()).get('/api/stores').set('Authorization', `Bearer ${accessToken}`);
  const storeId = stores.body[0].id as string;
  return request(app.getHttpServer())
    .post('/api/cash-sessions')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ storeId, openingAmountCents });
}
