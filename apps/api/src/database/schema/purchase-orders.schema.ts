import { pgTable, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { suppliers } from './suppliers.schema';
import { users } from './users.schema';

// No "sent" state on purpose: there's no real supplier notification
// integration yet (see docs/03, same spirit as fiscal/payment) — a
// status with no behavior behind it would be dead state. draft = order
// created; received = received (generates a stock entry); canceled = only
// from draft, a received order doesn't undo itself.
export const purchaseOrderStatusEnum = pgEnum('purchase_order_status', ['draft', 'received', 'canceled']);

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  status: purchaseOrderStatusEnum('status').notNull().default('draft'),
  notes: text('notes'),
  // Denormalized from the sum of the items — same pattern as sales.totalCents.
  totalCents: integer('total_cents').notNull().default(0),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  receivedAt: timestamp('received_at', { withTimezone: true }),
});

export type PurchaseOrderRow = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrderRow = typeof purchaseOrders.$inferInsert;
