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
// Days of access retained after the first declined charge before blocking —
// gives the store owner time to update the card without losing access
// immediately.
const GRACE_PERIOD_DAYS = 5;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * subscriptions/subscription_invoices don't have RLS by tenant_id — same
 * treatment as `tenants`: they're platform data about the tenant (billing),
 * not tenant-isolated business data like sales/products. This is also
 * necessary in practice: the billing cron needs to scan ALL tenants at once
 * to find who's overdue, which per-session RLS would prevent. All access is
 * still explicitly filtered by tenantId in the code.
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

  // Serves three cases with a single endpoint: first subscription,
  // reactivation (was canceled or blocked for non-payment), and plan change.
  // All of them charge immediately and restart the 30-day cycle from now —
  // security review finding (2026-08-17): a plan change without an
  // immediate charge allowed subscribing to Multi-loja, creating extra
  // stores, and switching back to Starter before renewal, ending up with
  // access to all the stores without ever actually paying for them.
  // Changing plans without charging again would require real proration —
  // out of scope for the billing MVP; charging the new plan's full price
  // immediately is simpler and closes the hole.
  async subscribe(tenantId: string, input: SubscribeInput): Promise<SubscriptionRow> {
    const existing = await this.getSubscription(tenantId);
    const priceCents = SUBSCRIPTION_PLAN_CATALOG[input.plan].priceCents;

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

  // Immediate cancellation, not scheduled for the end of the cycle —
  // deliberate simplification of the billing MVP (avoids a "canceled but
  // stays active until such date" state that would need yet another state
  // machine).
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

  // Charges overdue cycles (status active/past_due with currentPeriodEnd in
  // the past). Success advances the period; failure marks past_due (1st
  // time) and keeps retrying every day until the grace period runs out, at
  // which point it blocks. A tenant that's already blocked is no longer
  // retried on its own — only via subscribe() (manual reactivation), so we
  // don't keep trying to charge a card already known to be invalid.
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
