import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import type { Env } from '../src/config/env.validation';
import { DRIZZLE, type Database } from '../src/database/drizzle.provider';
import { subscriptions, subscriptionInvoices, tenants, users } from '../src/database/schema/index';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../src/modules/payments/payment-provider.interface';
import { BillingService } from '../src/modules/billing/billing.service';
import { registerTenant } from './helpers/register-tenant';

// Mesmo helper de fidelidade/comissoes: cria o usuário direto no banco, sem
// depender do fluxo de convite/e-mail.
async function mintUser(app: INestApplication, db: Database, tenantId: string, role: 'admin' | 'operador_caixa') {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@pcaarb.test`;
  const passwordHash = await bcrypt.hash('SenhaForte123', 12);
  const [user] = await db.insert(users).values({ tenantId, name: role, email, passwordHash, role }).returning();
  const jwtService = app.get(JwtService);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const accessToken = await jwtService.signAsync(
    { sub: user!.id, tenantId, role },
    { secret: config.get('JWT_ACCESS_SECRET', { infer: true }), expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }) },
  );
  return { id: user!.id, accessToken };
}

describe('Assinatura / billing (e2e)', () => {
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

  it('tenant novo em trial ainda não tem assinatura', async () => {
    const tenant = await registerTenant(app, 'billing-trial');
    const subscription = await request(app.getHttpServer())
      .get('/api/billing/subscription')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(subscription.status).toBe(404);
  });

  it('owner assina um plano — cobra na hora e ativa o tenant', async () => {
    const tenant = await registerTenant(app, 'billing-assina');
    const subscribe = await request(app.getHttpServer())
      .post('/api/billing/subscribe')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ plan: 'profissional' });
    expect(subscribe.status).toBe(201);
    expect(subscribe.body.plan).toBe('profissional');
    expect(subscribe.body.status).toBe('active');
    expect(subscribe.body.priceCents).toBe(24_900);

    const [tenantRow] = await db.select().from(tenants).where(eq(tenants.id, tenant.tenantId));
    expect(tenantRow?.status).toBe('active');

    const invoices = await request(app.getHttpServer())
      .get('/api/billing/invoices')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(invoices.body).toHaveLength(1);
    expect(invoices.body[0].status).toBe('paid');
    expect(invoices.body[0].amountCents).toBe(24_900);
  });

  it('admin e operador de caixa não podem assinar nem cancelar — só owner', async () => {
    const tenant = await registerTenant(app, 'billing-rbac');
    const admin = await mintUser(app, db, tenant.tenantId, 'admin');
    const cashier = await mintUser(app, db, tenant.tenantId, 'operador_caixa');

    const adminSubscribe = await request(app.getHttpServer())
      .post('/api/billing/subscribe')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ plan: 'starter' });
    expect(adminSubscribe.status).toBe(403);

    const cashierSubscribe = await request(app.getHttpServer())
      .post('/api/billing/subscribe')
      .set('Authorization', `Bearer ${cashier.accessToken}`)
      .send({ plan: 'starter' });
    expect(cashierSubscribe.status).toBe(403);

    // Leitura continua liberada pra qualquer papel do tenant (404 aqui é
    // porque não existe assinatura, não porque foi bloqueado por RBAC).
    const adminReadsSubscription = await request(app.getHttpServer())
      .get('/api/billing/subscription')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(adminReadsSubscription.status).toBe(404);
  });

  it('trocar de plano com assinatura ativa não gera cobrança nova', async () => {
    const tenant = await registerTenant(app, 'billing-troca-plano');
    await request(app.getHttpServer())
      .post('/api/billing/subscribe')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ plan: 'starter' });

    const switchPlan = await request(app.getHttpServer())
      .post('/api/billing/subscribe')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ plan: 'multi_loja' });
    expect(switchPlan.status).toBe(201);
    expect(switchPlan.body.plan).toBe('multi_loja');
    expect(switchPlan.body.priceCents).toBe(34_900);

    const invoices = await request(app.getHttpServer())
      .get('/api/billing/invoices')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(invoices.body).toHaveLength(1); // só a cobrança da assinatura inicial, troca de plano não cobrou de novo
  });

  it('cancelar bloqueia o resto da API mas billing continua acessível pra reativar', async () => {
    const tenant = await registerTenant(app, 'billing-cancela');
    await request(app.getHttpServer())
      .post('/api/billing/subscribe')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ plan: 'starter' });

    const cancel = await request(app.getHttpServer())
      .post('/api/billing/cancel')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(cancel.status).toBe(201);
    expect(cancel.body.status).toBe('canceled');

    const blockedFromProducts = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(blockedFromProducts.status).toBe(403);

    // Endpoints de billing usam @BypassTenantStatus() — senão o tenant cancelado
    // nunca conseguiria nem ver a própria fatura nem reativar a assinatura.
    const readSubscriptionWhileCanceled = await request(app.getHttpServer())
      .get('/api/billing/subscription')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(readSubscriptionWhileCanceled.status).toBe(200);
    expect(readSubscriptionWhileCanceled.body.status).toBe('canceled');

    const reactivate = await request(app.getHttpServer())
      .post('/api/billing/subscribe')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ plan: 'starter' });
    expect(reactivate.status).toBe(201);
    expect(reactivate.body.status).toBe('active');

    const backToProducts = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(backToProducts.status).toBe(200);

    const invoicesAfterReactivation = await request(app.getHttpServer())
      .get('/api/billing/invoices')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(invoicesAfterReactivation.body).toHaveLength(2); // assinatura inicial + reativação, cada uma cobrou
  });

  it('cobrança de renovação bem-sucedida avança o período e registra fatura paga', async () => {
    const tenant = await registerTenant(app, 'billing-renovacao');
    await request(app.getHttpServer())
      .post('/api/billing/subscribe')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ plan: 'starter' });

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.update(subscriptions).set({ currentPeriodEnd: yesterday }).where(eq(subscriptions.tenantId, tenant.tenantId));

    const billingService = app.get(BillingService);
    const processed = await billingService.processDueBilling();
    expect(processed).toBeGreaterThanOrEqual(1);

    const [after] = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenant.tenantId));
    expect(after?.status).toBe('active');
    // Renovou a partir da data vencida (ontem), não da data atual — período
    // novo começa exatamente onde o anterior devia ter terminado.
    expect(after!.currentPeriodEnd.getTime()).toBeGreaterThan(yesterday.getTime());
    expect(after!.currentPeriodStart.getTime()).toBe(yesterday.getTime());

    const invoices = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.tenantId, tenant.tenantId));
    expect(invoices).toHaveLength(2);
    expect(invoices.every((invoice) => invoice.status === 'paid')).toBe(true);
  });

  it('valida o corpo do subscribe (plano inválido) e rejeita cancelar sem assinatura', async () => {
    const tenant = await registerTenant(app, 'billing-validacao');

    const invalidPlan = await request(app.getHttpServer())
      .post('/api/billing/subscribe')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ plan: 'enterprise' }); // enterprise é sob consulta, não assinável via checkout
    expect(invalidPlan.status).toBe(400);

    const cancelWithoutSubscription = await request(app.getHttpServer())
      .post('/api/billing/cancel')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(cancelWithoutSubscription.status).toBe(400);
  });
});

describe('Assinatura — inadimplência e carência (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let billingService: BillingService;

  beforeAll(async () => {
    const decliningProvider: PaymentProvider = {
      async charge() {
        return { approved: false, providerTransactionId: 'n/a', declineReason: 'cartão recusado (simulado)' };
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(decliningProvider)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get(DRIZZLE);
    billingService = app.get(BillingService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('primeira cobrança recusada não persiste assinatura nenhuma', async () => {
    const tenant = await registerTenant(app, 'billing-recusa-inicial');
    const subscribe = await request(app.getHttpServer())
      .post('/api/billing/subscribe')
      .set('Authorization', `Bearer ${tenant.accessToken}`)
      .send({ plan: 'starter' });
    expect(subscribe.status).toBe(400);
    expect(subscribe.body.message).toMatch(/recusad[ao]/i);

    const [tenantRow] = await db.select().from(tenants).where(eq(tenants.id, tenant.tenantId));
    expect(tenantRow?.status).toBe('trial'); // continua em trial, nada foi criado

    const [subscriptionRow] = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenant.tenantId));
    expect(subscriptionRow).toBeUndefined();
  });

  it('cobrança recusada marca past_due (com carência) e só bloqueia depois que a carência esgota', async () => {
    const tenant = await registerTenant(app, 'billing-carencia');
    const now = new Date();
    const [subscription] = await db
      .insert(subscriptions)
      .values({ tenantId: tenant.tenantId, plan: 'starter', priceCents: 11_900, currentPeriodStart: now, currentPeriodEnd: now })
      .returning();

    await billingService.processDueBilling();

    const [afterFirstFailure] = await db.select().from(tenants).where(eq(tenants.id, tenant.tenantId));
    expect(afterFirstFailure?.status).toBe('past_due'); // ainda com acesso — carência de 5 dias

    const [subscriptionAfterFirstFailure] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscription!.id));
    expect(subscriptionAfterFirstFailure?.status).toBe('past_due');
    expect(subscriptionAfterFirstFailure?.pastDueSince).not.toBeNull();

    const stillHasAccess = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(stillHasAccess.status).toBe(200);

    // Simula carência esgotada: pastDueSince há 10 dias (grace period é 5).
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await db.update(subscriptions).set({ pastDueSince: tenDaysAgo, currentPeriodEnd: tenDaysAgo }).where(eq(subscriptions.id, subscription!.id));

    await billingService.processDueBilling();

    const [afterGraceExpired] = await db.select().from(tenants).where(eq(tenants.id, tenant.tenantId));
    expect(afterGraceExpired?.status).toBe('blocked');

    const blockedFromProducts = await request(app.getHttpServer())
      .get('/api/products')
      .set('Authorization', `Bearer ${tenant.accessToken}`);
    expect(blockedFromProducts.status).toBe(403);

    // Uma vez bloqueado, o cron para de tentar cobrar sozinho de novo.
    const processedAfterBlocked = await billingService.processDueBilling();
    expect(processedAfterBlocked).toBe(0);

    const invoices = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.tenantId, tenant.tenantId));
    expect(invoices).toHaveLength(2); // uma por tentativa de cobrança recusada (antes e no dia da carência esgotada)
    expect(invoices.every((invoice) => invoice.status === 'failed')).toBe(true);
  });
});
