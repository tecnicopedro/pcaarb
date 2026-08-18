import { pgTable, uuid, integer, timestamp, pgEnum, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { subscriptions } from './subscriptions.schema';

export const subscriptionInvoiceStatusEnum = pgEnum('subscription_invoice_status', ['paid', 'failed']);

// Ledger imutável de tentativas de cobrança — nunca atualizado depois de
// criado, mesmo padrão de loyalty_ledger_entries/stock_movements: histórico
// de fatura é auditoria, não estado mutável.
export const subscriptionInvoices = pgTable('subscription_invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id')
    .notNull()
    .references(() => subscriptions.id, { onDelete: 'cascade' }),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: subscriptionInvoiceStatusEnum('status').notNull(),
  providerChargeId: text('provider_charge_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SubscriptionInvoiceRow = typeof subscriptionInvoices.$inferSelect;
export type NewSubscriptionInvoiceRow = typeof subscriptionInvoices.$inferInsert;
