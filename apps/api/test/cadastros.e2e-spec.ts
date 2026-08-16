import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { registerTenant } from './helpers/register-tenant';

describe('Cadastros (e2e)', () => {
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

  it('CRUD completo de categoria e produto, com validações de negócio', async () => {
    const tenantA = await registerTenant(app, 'a');

    const category = await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ name: 'Bebidas' });
    expect(category.status).toBe(201);

    const product = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ name: 'Refrigerante 2L', sku: 'REF2L', priceCents: 899, categoryId: category.body.id });
    expect(product.status).toBe(201);
    expect(product.body.priceCents).toBe(899);

    const duplicateSku = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ name: 'Outro', sku: 'REF2L', priceCents: 100 });
    expect(duplicateSku.status).toBe(409);

    const missingCategory = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({
        name: 'Produto sem categoria',
        priceCents: 100,
        categoryId: '00000000-0000-0000-0000-000000000000',
      });
    expect(missingCategory.status).toBe(404);

    const deleteCategoryInUse = await request(app.getHttpServer())
      .delete(`/api/categories/${category.body.id}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    expect(deleteCategoryInUse.status).toBe(409);

    const update = await request(app.getHttpServer())
      .patch(`/api/products/${product.body.id}`)
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ active: false });
    expect(update.status).toBe(200);
    expect(update.body.active).toBe(false);
  });

  it('isola dados entre tenants diferentes (RLS)', async () => {
    const tenantA = await registerTenant(app, 'iso-a');
    const tenantB = await registerTenant(app, 'iso-b');

    await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ name: 'Produto exclusivo do tenant A', priceCents: 500 });

    const productsForB = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(productsForB.status).toBe(200);
    expect(productsForB.body).toEqual([]);

    const productsForA = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${tenantA.accessToken}`);
    expect(productsForA.body).toHaveLength(1);
  });

  it('bloqueia operador de caixa de criar produto/fornecedor, mas permite leitura de produto', async () => {
    const tenantA = await registerTenant(app, 'rbac');

    await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .send({ name: 'Produto visível ao caixa', priceCents: 500 });

    const cashierEmail = `caixa-${Date.now()}@pcaarb.test`;
    const passwordHash = await bcrypt.hash('SenhaForte123', 12);
    await db.insert(users).values({
      tenantId: tenantA.tenantId,
      name: 'Operador de Caixa',
      email: cashierEmail,
      passwordHash,
      role: 'operador_caixa',
    });

    const cashierLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: cashierEmail, password: 'SenhaForte123' });
    const cashierToken = cashierLogin.body.accessToken as string;

    const listProducts = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(listProducts.status).toBe(200);
    expect(listProducts.body).toHaveLength(1);

    const createProduct = await request(app.getHttpServer())
      .post('/api/products')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ name: 'Produto proibido', priceCents: 100 });
    expect(createProduct.status).toBe(403);

    const listSuppliers = await request(app.getHttpServer())
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(listSuppliers.status).toBe(403);
  });
});
