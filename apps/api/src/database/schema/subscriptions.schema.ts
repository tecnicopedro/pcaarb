import { pgTable, uuid, integer, timestamp, pgEnum, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';

export const subscriptionPlanEnum = pgEnum('subscription_plan', ['starter', 'profissional', 'multi_loja', 'enterprise']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'past_due', 'canceled']);

// Uma linha por tenant (única — reassinar depois de cancelar reaproveita a
// mesma linha, não empilha histórico; histórico de cobrança vive em
// subscription_invoices). priceCents é o preço no momento da assinatura —
// mudar o catálogo depois não altera retroativamente quem já assinou.
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    plan: subscriptionPlanEnum('plan').notNull(),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    priceCents: integer('price_cents').notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    // Marcado no primeiro ciclo de cobrança que falhou — usado pra calcular
    // a carência antes de bloquear (ver BillingService).
    pastDueSince: timestamp('past_due_since', { withTimezone: true }),
    providerCustomerId: text('provider_customer_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUnique: uniqueIndex('subscriptions_tenant_unique').on(table.tenantId),
  }),
);

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type NewSubscriptionRow = typeof subscriptions.$inferInsert;
