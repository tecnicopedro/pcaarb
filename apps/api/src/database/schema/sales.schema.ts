import { pgTable, uuid, integer, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';
import { customers } from './customers.schema';
import { cashSessions } from './cash-sessions.schema';
import { stores } from './stores.schema';

export const saleStatusEnum = pgEnum('sale_status', ['completed', 'canceled']);

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // Denormalized from cash_sessions.store_id at the time of the sale
    // (same rationale as sale_items denormalizing the product's name/price) —
    // avoids a join for the consolidated per-store report, which is the real
    // value of the Multi-store plan.
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
    // Generated on the client (not the server) at the moment the operator
    // finalizes the sale on the offline PDV — it's the PWA's idempotency key:
    // syncing the same queued sale twice (network retry, service worker
    // waking up again) returns the sale already created instead of selling
    // twice. Null on every "normal" sale (online, no queue) — NULL never
    // collides with NULL in the unique index, so it doesn't change anything
    // for the existing flow.
    clientSaleId: uuid('client_sale_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantClientSaleIdUnique: uniqueIndex('sales_tenant_client_sale_id_unique').on(table.tenantId, table.clientSaleId),
  }),
);

export type SaleRow = typeof sales.$inferSelect;
export type NewSaleRow = typeof sales.$inferInsert;
