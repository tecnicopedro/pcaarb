import { pgTable, uuid, integer, timestamp, pgEnum, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';

export const subscriptionPlanEnum = pgEnum('subscription_plan', ['starter', 'profissional', 'multi_loja', 'enterprise']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'past_due', 'canceled']);

// One row per tenant (unique — resubscribing after canceling reuses the
// same row, it doesn't stack history; billing history lives in
// subscription_invoices). priceCents is the price at the time of subscribing
// — changing the catalog afterward doesn't retroactively change existing subscribers.
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
    // Set on the first billing cycle that failed — used to calculate the
    // grace period before blocking (see BillingService).
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
