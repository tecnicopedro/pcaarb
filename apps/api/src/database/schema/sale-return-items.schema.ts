import { pgTable, uuid, integer, text, boolean } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { saleReturns } from './sale-returns.schema';
import { saleItems } from './sale-items.schema';
import { products } from './products.schema';

// A returned line. Always inserted, even when `applied = false` (a
// rejected return writes nothing — see SaleReturnsService — but if
// all-or-nothing ever becomes per-line in the future, the pattern is
// already in place, same reasoning as marketplace_order_items).
export const saleReturnItems = pgTable('sale_return_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Denormalized (also exists via sale_returns.tenant_id) on purpose:
  // keeps the RLS policy simple and identical to the other tables, same
  // rationale as sale_items.
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  saleReturnId: uuid('sale_return_id')
    .notNull()
    .references(() => saleReturns.id, { onDelete: 'cascade' }),
  saleItemId: uuid('sale_item_id')
    .notNull()
    .references(() => saleItems.id),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  quantity: integer('quantity').notNull(),
  // Snapshot of the unit price of the original line (sale_items.unit_price_cents).
  unitPriceCents: integer('unit_price_cents').notNull(),
  // Amount actually refunded for this line, already apportioned for any
  // discount/redemption on the original sale — see SaleReturnsService.
  refundedCents: integer('refunded_cents').notNull(),
  applied: boolean('applied').notNull().default(true),
  issue: text('issue'),
});

export type SaleReturnItemRow = typeof saleReturnItems.$inferSelect;
export type NewSaleReturnItemRow = typeof saleReturnItems.$inferInsert;
