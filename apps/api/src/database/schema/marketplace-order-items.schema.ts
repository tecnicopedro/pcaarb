import { pgTable, uuid, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { marketplaceOrders } from './marketplace-orders.schema';
import { products } from './products.schema';

// Line-by-line of the imported order, for auditing — including the ones that
// weren't applied (applied = false), with the reason in issue. productId is
// null when the externalProductId had no synced listing.
export const marketplaceOrderItems = pgTable('marketplace_order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id')
    .notNull()
    .references(() => marketplaceOrders.id, { onDelete: 'cascade' }),
  externalProductId: text('external_product_id').notNull(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  quantity: integer('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  applied: boolean('applied').notNull(),
  issue: text('issue'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MarketplaceOrderItemRow = typeof marketplaceOrderItems.$inferSelect;
export type NewMarketplaceOrderItemRow = typeof marketplaceOrderItems.$inferInsert;
