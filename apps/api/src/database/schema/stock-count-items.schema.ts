import { pgTable, uuid, text, integer } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { stockCounts } from './stock-counts.schema';
import { products } from './products.schema';

export const stockCountItems = pgTable('stock_count_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Denormalized on purpose, same pattern as sale_items/purchase_order_items.
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  stockCountId: uuid('stock_count_id')
    .notNull()
    .references(() => stockCounts.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  productName: text('product_name').notNull(),
  // The product's balance at the moment the count was opened — informational
  // only, the final adjustment (StockCountsService.finalize) recalculates
  // against the current balance so as not to lose movements that happened
  // during the count.
  expectedQuantity: integer('expected_quantity').notNull(),
  countedQuantity: integer('counted_quantity'),
});

export type StockCountItemRow = typeof stockCountItems.$inferSelect;
export type NewStockCountItemRow = typeof stockCountItems.$inferInsert;
