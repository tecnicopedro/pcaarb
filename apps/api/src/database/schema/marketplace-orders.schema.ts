import { pgTable, uuid, text, integer, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { marketplaceChannels } from './marketplace-channels.schema';

export const marketplaceOrderStatusEnum = pgEnum('marketplace_order_status', ['imported', 'needs_attention']);

// An order placed on the marketplace, pulled via MarketplaceProvider.fetchNewOrders.
// The unique on (channelId, externalOrderId) is the idempotency key: a
// sync retry that returns the same order again doesn't duplicate the
// stock deduction (see MarketplaceOrdersService.pullOrders).
export const marketplaceOrders = pgTable(
  'marketplace_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => marketplaceChannels.id, { onDelete: 'cascade' }),
    externalOrderId: text('external_order_id').notNull(),
    totalCents: integer('total_cents').notNull(),
    status: marketplaceOrderStatusEnum('status').notNull(),
    // Filled in only when status = 'needs_attention': unmapped product,
    // inactive, or insufficient stock — never left blank when the
    // order wasn't applied, so the reason never has to be guessed later.
    issue: text('issue'),
    importedAt: timestamp('imported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    channelExternalOrderUnique: uniqueIndex('marketplace_orders_channel_external_order_unique').on(
      table.channelId,
      table.externalOrderId,
    ),
  }),
);

export type MarketplaceOrderRow = typeof marketplaceOrders.$inferSelect;
export type NewMarketplaceOrderRow = typeof marketplaceOrders.$inferInsert;
