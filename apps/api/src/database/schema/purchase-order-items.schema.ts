import { pgTable, uuid, integer, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { purchaseOrders } from './purchase-orders.schema';
import { products } from './products.schema';

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Denormalized (also exists via purchase_orders.tenant_id) — same
  // pattern as sale_items, keeps the RLS policy simple and JOIN-free.
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  purchaseOrderId: uuid('purchase_order_id')
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  // Snapshot of the name at order time: the product's name can change
  // later, but the order's history can't.
  productName: text('product_name').notNull(),
  unitCostCents: integer('unit_cost_cents').notNull(),
  quantity: integer('quantity').notNull(),
  totalCents: integer('total_cents').notNull(),
});

export type PurchaseOrderItemRow = typeof purchaseOrderItems.$inferSelect;
export type NewPurchaseOrderItemRow = typeof purchaseOrderItems.$inferInsert;
