import { pgTable, uuid, integer, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { sales } from './sales.schema';
import { products } from './products.schema';

export const saleItems = pgTable('sale_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Denormalized (also exists via sales.tenant_id) on purpose: keeps the
  // RLS policy simple and identical to the other tables, without needing a
  // subquery via JOIN on sale_id for every row check.
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  saleId: uuid('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  // Snapshot of the name/price at the time of sale: the product's price can
  // change later, but the sale's history can't.
  productName: text('product_name').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  quantity: integer('quantity').notNull(),
  totalCents: integer('total_cents').notNull(),
});

export type SaleItemRow = typeof saleItems.$inferSelect;
export type NewSaleItemRow = typeof saleItems.$inferInsert;
