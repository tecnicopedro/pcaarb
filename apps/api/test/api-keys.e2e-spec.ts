import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { apiKeys, users } from '../src/database/schema/index';
import { registerTenant } from './helpers/register-tenant';

async function loginAs(app: INestApplication, db: Database, tenantId: string, role: 'admin' | 'financeiro' | 'operador_caixa') {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
  const passwordHash = await bcrypt.hash('SenhaForte123', 12);
  await db.insert(users).values({ tenantId, name: role, email, passwordHash, role });
  const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'SenhaForte123' });
  return login.body.accessToken as string;
}

async function createApiKey(
  app: INestApplication,
  accessToken: string,
  body: { name: string; role: string; expiresAt?: string },
) {
  return request(app.getHttpServer()).post('/api/api-keys').set('Authorization', `Bearer ${accessToken}`).send(body);
}

describe('Chaves de API (e2e)', () => {
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

  it('owner cria uma chave, recebe o segredo cru uma única vez, e a chave autentica normalmente na API', async () => {
    const tenant = await registerTenant(app, 'apikey-cria');

    const created = await createApiKey(app, tenant.accessToken, { name: 'Integração de teste', role: 'admin' });
    expect(created.status).toBe(201);
    expect(created.body.rawKey).toMatch(/^pcaarb_live_/);
    expect(created.body.role).toBe('admin');
    expect(created.body.keyPrefix).toBe(created.body.rawKey.slice(0, created.body.keyPrefix.length));

    // The raw key is never persisted — only the hash. Confirm directly in the database.
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, created.body.id));
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toContain(created.body.rawKey);

    const usingApiKey = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${created.body.rawKey}`);
    expect(usingApiKey.status).toBe(200);
  });

  it('listagem nunca expõe a chave crua nem o hash', async () => {
    const tenant = await registerTenant(app, 'apikey-lista');
    await createApiKey(app, tenant.accessToken, { name: 'Chave A', role: 'financeiro' });

    const list = await request(app.getHttpServer()).get('/api/api-keys').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).not.toHaveProperty('rawKey');
    expect(list.body[0]).not.toHaveProperty('keyHash');
    expect(list.body[0].keyPrefix).toMatch(/^pcaarb_live_/);
  });

  it('revogar impede a chave de autenticar; revogar de novo é rejeitado', async () => {
    const tenant = await registerTenant(app, 'apikey-revoga');
    const created = await createApiKey(app, tenant.accessToken, { name: 'Vai revogar', role: 'admin' });

    const revoke = await request(app.getHttpServer())
      .delete(`/api/api-keys/${created.body.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(revoke.status).toBe(204);

    const afterRevoke = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${created.body.rawKey}`);
    expect(afterRevoke.status).toBe(401);

    const revokeAgain = await request(app.getHttpServer())
      .delete(`/api/api-keys/${created.body.id}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(revokeAgain.status).toBe(409);
  });

  it('chave expirada é rejeitada na autenticação', async () => {
    const tenant = await registerTenant(app, 'apikey-expira');
    const created = await createApiKey(app, tenant.accessToken, { name: 'Vai expirar', role: 'admin' });
    expect(created.status).toBe(201);

    // Simulate expiry directly in the database (creating one already expired
    // is rejected by validation — see the "past date" test below).
    await db.update(apiKeys).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(apiKeys.id, created.body.id));

    const attempt = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${created.body.rawKey}`);
    expect(attempt.status).toBe(401);
  });

  it('criar chave com data de expiração no passado é rejeitado', async () => {
    const tenant = await registerTenant(app, 'apikey-expira-passado');
    const attempt = await createApiKey(app, tenant.accessToken, {
      name: 'Inválida',
      role: 'admin',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(attempt.status).toBe(400);
  });

  it('respeita o papel da chave: uma chave operador_caixa vende mas não gerencia produtos, mesmo CASL de um usuário normal', async () => {
    const tenant = await registerTenant(app, 'apikey-rbac-papel');
    const created = await createApiKey(app, tenant.accessToken, { name: 'PDV automatizado', role: 'operador_caixa' });

    const readProducts = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${created.body.rawKey}`);
    expect(readProducts.status).toBe(200);

    const createProduct = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${created.body.rawKey}`)
      .send({ name: 'Não devia conseguir', priceCents: 1000 });
    expect(createProduct.status).toBe(403);
  });

  it('só admin/owner gerenciam chaves de API; financeiro e operador de caixa são rejeitados', async () => {
    const tenant = await registerTenant(app, 'apikey-rbac-gestao');
    const financeiroToken = await loginAs(app, db, tenant.tenantId, 'financeiro');
    const cashierToken = await loginAs(app, db, tenant.tenantId, 'operador_caixa');

    const financeiroAttempt = await request(app.getHttpServer())
      .get('/api/api-keys')
      .set('Authorization', `Bearer ${financeiroToken}`);
    expect(financeiroAttempt.status).toBe(403);

    const cashierAttempt = await request(app.getHttpServer())
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ name: 'Tentativa', role: 'admin' });
    expect(cashierAttempt.status).toBe(403);
  });

  it('admin (não-owner) não consegue criar chave com papel de owner; owner consegue', async () => {
    const tenant = await registerTenant(app, 'apikey-owner-key');
    const adminToken = await loginAs(app, db, tenant.tenantId, 'admin');

    const adminAttempt = await createApiKey(app, adminToken, { name: 'God mode', role: 'owner' });
    expect(adminAttempt.status).toBe(403);

    const ownerAttempt = await createApiKey(app, tenant.accessToken, { name: 'God mode de verdade', role: 'owner' });
    expect(ownerAttempt.status).toBe(201);
    expect(ownerAttempt.body.role).toBe('owner');
  });

  it('a conta de serviço vinculada à chave nunca aparece na listagem de usuários', async () => {
    const tenant = await registerTenant(app, 'apikey-nao-aparece');
    await createApiKey(app, tenant.accessToken, { name: 'Chave escondida', role: 'admin' });

    const usersList = await request(app.getHttpServer()).get('/api/users').set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(usersList.status).toBe(200);
    expect(usersList.body.every((u: { name: string }) => !u.name.startsWith('Chave de API'))).toBe(true);
  });

  it('isola chaves entre tenants diferentes — uma chave só enxerga dados do próprio tenant', async () => {
    const tenantA = await registerTenant(app, 'apikey-isola-a');
    const tenantB = await registerTenant(app, 'apikey-isola-b');
    const keyA = await createApiKey(app, tenantA.accessToken, { name: 'Chave A', role: 'admin' });

    await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${keyA.body.rawKey}`)
      .send({ name: 'Produto do tenant A', priceCents: 1000 });

    const productsViaKeyA = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${keyA.body.rawKey}`);
    expect(productsViaKeyA.body).toHaveLength(1);

    const productsTenantB = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(productsTenantB.body).toHaveLength(0);
  });

  it('token inexistente/inválido no formato de chave de API é rejeitado', async () => {
    const attempt = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', 'Bearer pcaarb_live_chaveinventada00000000000000');
    expect(attempt.status).toBe(401);
  });
});
