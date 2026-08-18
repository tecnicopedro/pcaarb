import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import { SUBSCRIPTION_PLAN_CATALOG, type SubscribeInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import {
  subscriptions,
  subscriptionInvoices,
  tenants,
  type SubscriptionRow,
  type SubscriptionInvoiceRow,
} from '../../database/schema/index';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../payments/payment-provider.interface';

const BILLING_PERIOD_DAYS = 30;
// Dias de acesso mantido depois da primeira cobrança recusada antes de
// bloquear — dá tempo do lojista atualizar o cartão sem perder acesso na hora.
const GRACE_PERIOD_DAYS = 5;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * subscriptions/subscription_invoices não têm RLS por tenant_id — mesmo
 * tratamento de `tenants`: são dado de plataforma sobre o tenant (billing),
 * não dado de negócio isolado por tenant como vendas/produtos. Isso também é
 * necessário na prática: o cron de cobrança precisa varrer TODOS os tenants
 * de uma vez pra achar quem está vencido, o que RLS por sessão impediria.
 * Todo acesso continua filtrado explicitamente por tenantId no código.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  async getSubscription(tenantId: string): Promise<SubscriptionRow | undefined> {
    const [row] = await this.db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).limit(1);
    return row;
  }

  async listInvoices(tenantId: string): Promise<SubscriptionInvoiceRow[]> {
    return this.db
      .select()
      .from(subscriptionInvoices)
      .where(eq(subscriptionInvoices.tenantId, tenantId))
      .orderBy(desc(subscriptionInvoices.createdAt));
  }

  // Serve três casos com um endpoint só: primeira assinatura, reativação
  // (estava cancelada ou bloqueada por inadimplência) e troca de plano.
  // Só os dois primeiros cobram na hora — trocar de plano com assinatura já
  // ativa não gera cobrança imediata (evita cobrar duas vezes no mesmo dia);
  // o novo preço vale a partir do próximo ciclo.
  async subscribe(tenantId: string, input: SubscribeInput): Promise<SubscriptionRow> {
    const existing = await this.getSubscription(tenantId);
    const priceCents = SUBSCRIPTION_PLAN_CATALOG[input.plan].priceCents;

    if (existing && existing.status === 'active') {
      const [updated] = await this.db
        .update(subscriptions)
        .set({ plan: input.plan, priceCents, updatedAt: new Date() })
        .where(eq(subscriptions.tenantId, tenantId))
        .returning();
      if (!updated) {
        throw new Error('Falha ao trocar de plano');
      }
      return updated;
    }

    const charge = await this.paymentProvider.charge({
      tenantId,
      saleId: null,
      method: 'cartao_credito',
      amountCents: priceCents,
    });
    if (!charge.approved) {
      throw new BadRequestException(charge.declineReason ?? 'Pagamento recusado pelo gateway');
    }

    const now = new Date();
    const periodEnd = addDays(now, BILLING_PERIOD_DAYS);

    return this.db.transaction(async (tx) => {
      const [row] = existing
        ? await tx
            .update(subscriptions)
            .set({
              plan: input.plan,
              priceCents,
              status: 'active',
              pastDueSince: null,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              updatedAt: now,
            })
            .where(eq(subscriptions.tenantId, tenantId))
            .returning()
        : await tx
            .insert(subscriptions)
            .values({ tenantId, plan: input.plan, priceCents, currentPeriodStart: now, currentPeriodEnd: periodEnd })
            .returning();
      if (!row) {
        throw new Error('Falha ao criar assinatura');
      }

      await tx.insert(subscriptionInvoices).values({
        tenantId,
        subscriptionId: row.id,
        periodStart: now,
        periodEnd,
        amountCents: priceCents,
        status: 'paid',
        providerChargeId: charge.providerTransactionId,
      });
      await tx.update(tenants).set({ status: 'active' }).where(eq(tenants.id, tenantId));

      return row;
    });
  }

  // Cancelamento imediato, não agendado pro fim do ciclo — simplificação
  // deliberada do MVP de billing (evita um estado "cancela mas continua
  // ativo até tal data" que precisaria de mais uma máquina de estados).
  async cancel(tenantId: string): Promise<SubscriptionRow> {
    const existing = await this.getSubscription(tenantId);
    if (!existing || existing.status === 'canceled') {
      throw new BadRequestException('Nenhuma assinatura ativa pra cancelar');
    }

    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(subscriptions)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(eq(subscriptions.tenantId, tenantId))
        .returning();
      if (!updated) {
        throw new Error('Falha ao cancelar assinatura');
      }
      await tx.update(tenants).set({ status: 'canceled' }).where(eq(tenants.id, tenantId));
      return updated;
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron(): Promise<void> {
    const processed = await this.processDueBilling();
    if (processed > 0) {
      this.logger.log(`${processed} assinatura(s) processada(s) no ciclo de cobrança.`);
    }
  }

  // Cobra ciclos vencidos (status active/past_due com currentPeriodEnd no
  // passado). Sucesso avança o período; falha marca past_due (1ª vez) e
  // segue tentando todo dia até a carência esgotar, quando bloqueia. Tenant
  // já bloqueado não é mais tentado sozinho — só via subscribe() (reativação
  // manual), pra não ficar tentando cobrar um cartão já sabido inválido.
  async processDueBilling(): Promise<number> {
    const now = new Date();
    const due = await this.db
      .select({ subscription: subscriptions, tenantStatus: tenants.status })
      .from(subscriptions)
      .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
      .where(and(inArray(subscriptions.status, ['active', 'past_due']), lte(subscriptions.currentPeriodEnd, now)));

    let processed = 0;
    for (const { subscription, tenantStatus } of due) {
      if (tenantStatus === 'blocked') {
        continue;
      }
      processed += 1;

      const charge = await this.paymentProvider.charge({
        tenantId: subscription.tenantId,
        saleId: null,
        method: 'cartao_credito',
        amountCents: subscription.priceCents,
      });

      if (charge.approved) {
        const periodEnd = addDays(subscription.currentPeriodEnd, BILLING_PERIOD_DAYS);
        await this.db.transaction(async (tx) => {
          await tx
            .update(subscriptions)
            .set({
              status: 'active',
              pastDueSince: null,
              currentPeriodStart: subscription.currentPeriodEnd,
              currentPeriodEnd: periodEnd,
              updatedAt: now,
            })
            .where(eq(subscriptions.id, subscription.id));
          await tx.insert(subscriptionInvoices).values({
            tenantId: subscription.tenantId,
            subscriptionId: subscription.id,
            periodStart: subscription.currentPeriodEnd,
            periodEnd,
            amountCents: subscription.priceCents,
            status: 'paid',
            providerChargeId: charge.providerTransactionId,
          });
          await tx.update(tenants).set({ status: 'active' }).where(eq(tenants.id, subscription.tenantId));
        });
        continue;
      }

      const pastDueSince = subscription.pastDueSince ?? now;
      const graceExpired = now.getTime() - pastDueSince.getTime() > GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
      await this.db.transaction(async (tx) => {
        await tx
          .update(subscriptions)
          .set({ status: 'past_due', pastDueSince, updatedAt: now })
          .where(eq(subscriptions.id, subscription.id));
        await tx.insert(subscriptionInvoices).values({
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          amountCents: subscription.priceCents,
          status: 'failed',
          providerChargeId: charge.providerTransactionId,
        });
        await tx
          .update(tenants)
          .set({ status: graceExpired ? 'blocked' : 'past_due' })
          .where(eq(tenants.id, subscription.tenantId));
      });
    }

    return processed;
  }
}
