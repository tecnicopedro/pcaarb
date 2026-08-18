import { pgTable, uuid, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';
import { customers } from './customers.schema';
import { cashSessions } from './cash-sessions.schema';
import { stores } from './stores.schema';

export const saleStatusEnum = pgEnum('sale_status', ['completed', 'canceled']);

export const sales = pgTable('sales', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  // Denormalizado a partir de cash_sessions.store_id no momento da venda
  // (mesmo racional de sale_items denormalizar nome/preço do produto) —
  // evita join pra relatório consolidado por loja, que é o valor real do
  // plano Multi-loja.
  storeId: uuid('store_id')
    .notNull()
    .references(() => stores.id),
  cashSessionId: uuid('cash_session_id')
    .notNull()
    .references(() => cashSessions.id),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  sellerId: uuid('seller_id')
    .notNull()
    .references(() => users.id),
  status: saleStatusEnum('status').notNull().default('completed'),
  subtotalCents: integer('subtotal_cents').notNull(),
  discountCents: integer('discount_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SaleRow = typeof sales.$inferSelect;
export type NewSaleRow = typeof sales.$inferInsert;
