import { pgTable, uuid, integer, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { purchaseOrders } from './purchase-orders.schema';
import { products } from './products.schema';

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Denormalizado (também existe via purchase_orders.tenant_id) — mesmo
  // padrão de sale_items, mantém a policy de RLS simples e sem JOIN.
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  purchaseOrderId: uuid('purchase_order_id')
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  // Snapshot do nome no momento do pedido: nome do produto pode mudar depois,
  // o histórico do pedido não.
  productName: text('product_name').notNull(),
  unitCostCents: integer('unit_cost_cents').notNull(),
  quantity: integer('quantity').notNull(),
  totalCents: integer('total_cents').notNull(),
});

export type PurchaseOrderItemRow = typeof purchaseOrderItems.$inferSelect;
export type NewPurchaseOrderItemRow = typeof purchaseOrderItems.$inferInsert;
