import { pgTable, uuid, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { sales } from './sales.schema';

export const paymentMethodEnum = pgEnum('payment_method', [
  'dinheiro',
  'cartao_credito',
  'cartao_debito',
  'pix',
]);

export const salePayments = pgTable('sale_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  saleId: uuid('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  method: paymentMethodEnum('method').notNull(),
  amountCents: integer('amount_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SalePaymentRow = typeof salePayments.$inferSelect;
export type NewSalePaymentRow = typeof salePayments.$inferInsert;
