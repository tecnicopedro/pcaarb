import { pgTable, uuid, text, integer } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { stockCounts } from './stock-counts.schema';
import { products } from './products.schema';

export const stockCountItems = pgTable('stock_count_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Denormalizado de propósito, mesmo padrão de sale_items/purchase_order_items.
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
  // Saldo do produto no momento em que a contagem foi aberta — só informativo,
  // o ajuste final (StockCountsService.finalize) recalcula contra o saldo
  // atual pra não perder movimentações que aconteceram durante a contagem.
  expectedQuantity: integer('expected_quantity').notNull(),
  countedQuantity: integer('counted_quantity'),
});

export type StockCountItemRow = typeof stockCountItems.$inferSelect;
export type NewStockCountItemRow = typeof stockCountItems.$inferInsert;
