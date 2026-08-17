import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { users } from '../src/database/schema/index';
import { registerTenant } from './helpers/register-tenant';

async function loginAs(app: INestApplication, db: Database, tenantId: string, role: 'financeiro' | 'operador_caixa') {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
  const passwordHash = await bcrypt.hash('SenhaForte123', 12);
  await db.insert(users).values({ tenantId, name: role, email, passwordHash, role });
  const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'SenhaForte123' });
  return login.body.accessToken as string;
}

async function createCostCenter(app: INestApplication, accessToken: string, name: string) {
  const response = await request(app.getHttpServer())
    .post('/api/cost-centers')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name });
  return response.body.id as string;
}

async function createPaidEntry(
  app: INestApplication,
  accessToken: string,
  body: { type: 'payable' | 'receivable'; description: string; amountCents: number; costCenterId?: string },
) {
  const created = await request(app.getHttpServer())
    .post('/api/finance-entries')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ ...body, dueDate: '2026-09-01' });
  await request(app.getHttpServer())
    .post(`/api/finance-entries/${created.body.id}/pay`)
    .set('Authorization', `Bearer ${accessToken}`);
  return created.body.id as string;
}

describe('Centro de custo e DRE (e2e)', () => {
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

  it('cria centro de custo, vincula a conta financeira e reflete no DRE', async () => {
    const tenant = await registerTenant(app, 'dre-fluxo');
    const lojaId = await createCostCenter(app, tenant.accessToken, 'Loja');
    const marketingId = await createCostCenter(app, tenant.accessToken, 'Marketing');

    const costCenters = await request(app.getHttpServer())
      .get('/api/cost-centers')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(costCenters.status).toBe(200);
    expect(costCenters.body).toHaveLength(2);

    await createPaidEntry(app, tenant.accessToken, {
      type: 'receivable',
      description: 'Venda balcão',
      amountCents: 50000,
      costCenterId: lojaId,
    });
    await createPaidEntry(app, tenant.accessToken, {
      type: 'payable',
      description: 'Anúncio',
      amountCents: 10000,
      costCenterId: marketingId,
    });
    // Conta sem centro de custo — deve cair no bucket "Sem centro de custo".
    await createPaidEntry(app, tenant.accessToken, { type: 'payable', description: 'Conta de luz', amountCents: 5000 });

    const dre = await request(app.getHttpServer())
      .get('/api/reports/dre')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(dre.status).toBe(200);
    expect(dre.body.receitasCents).toBe(50000);
    expect(dre.body.despesasCents).toBe(15000);
    expect(dre.body.resultadoCents).toBe(35000);
    expect(dre.body.porCentroDeCusto).toHaveLength(3);

    const lojaBucket = dre.body.porCentroDeCusto.find((b: { costCenterId: string }) => b.costCenterId === lojaId);
    expect(lojaBucket.receitasCents).toBe(50000);
    expect(lojaBucket.despesasCents).toBe(0);

    const semCentro = dre.body.porCentroDeCusto.find((b: { costCenterId: null }) => b.costCenterId === null);
    expect(semCentro.despesasCents).toBe(5000);
    expect(semCentro.costCenterName).toBe('Sem centro de custo');
  });

  it('rejeita conta com centro de custo inexistente', async () => {
    const tenant = await registerTenant(app, 'dre-invalido');
    const response = await request(app.getHttpServer())
      .post('/api/finance-entries')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({
        type: 'payable',
        description: 'Errado',
        amountCents: 1000,
        dueDate: '2026-09-01',
        costCenterId: '00000000-0000-0000-0000-000000000000',
      });
    expect(response.status).toBe(404);
  });

  it('centro de custo pode ser desativado sem quebrar contas já lançadas', async () => {
    const tenant = await registerTenant(app, 'dre-desativa');
    const costCenterId = await createCostCenter(app, tenant.accessToken, 'Temporário');
    await createPaidEntry(app, tenant.accessToken, { type: 'payable', description: 'Frete', amountCents: 2000, costCenterId });

    const deactivate = await request(app.getHttpServer())
      .patch(`/api/cost-centers/${costCenterId}`)
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ active: false });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.active).toBe(false);

    const dre = await request(app.getHttpServer())
      .get('/api/reports/dre')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    const bucket = dre.body.porCentroDeCusto.find((b: { costCenterId: string }) => b.costCenterId === costCenterId);
    expect(bucket.despesasCents).toBe(2000);
  });

  it('isola centros de custo entre tenants diferentes (RLS)', async () => {
    const tenantA = await registerTenant(app, 'dre-iso-a');
    const tenantB = await registerTenant(app, 'dre-iso-b');
    await createCostCenter(app, tenantA.accessToken, 'Só de A');

    const listForB = await request(app.getHttpServer())
      .get('/api/cost-centers')
      .set('Authorization', `Bearer ${tenantB.accessToken}`);
    expect(listForB.body).toEqual([]);
  });

  it('financeiro gerencia centro de custo e lê o DRE, operador de caixa não acessa nenhum dos dois', async () => {
    const tenant = await registerTenant(app, 'dre-rbac');
    const financeiroToken = await loginAs(app, db, tenant.tenantId, 'financeiro');
    const cashierToken = await loginAs(app, db, tenant.tenantId, 'operador_caixa');

    const createByFinanceiro = await request(app.getHttpServer())
      .post('/api/cost-centers')
      .set('Authorization', `Bearer ${financeiroToken}`)
      .send({ name: 'Administrativo' });
    expect(createByFinanceiro.status).toBe(201);

    const dreByFinanceiro = await request(app.getHttpServer())
      .get('/api/reports/dre')
      .set('Authorization', `Bearer ${financeiroToken}`);
    expect(dreByFinanceiro.status).toBe(200);

    const createByCashier = await request(app.getHttpServer())
      .post('/api/cost-centers')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ name: 'Proibido' });
    expect(createByCashier.status).toBe(403);

    const dreByCashier = await request(app.getHttpServer())
      .get('/api/reports/dre')
      .set('Authorization', `Bearer ${cashierToken}`);
    expect(dreByCashier.status).toBe(403);
  });
});
