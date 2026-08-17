import { pgTable, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { suppliers } from './suppliers.schema';
import { users } from './users.schema';

// Sem estado "sent" de propósito: não existe integração real de notificação
// ao fornecedor ainda (ver docs/03, mesmo espírito de fiscal/pagamento) — um
// status sem comportamento por trás seria estado morto. draft = pedido
// criado; received = recebido (gera entrada de estoque); canceled = só a
// partir de draft, recebido não se desfaz sozinho.
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
  // Denormalizado a partir da soma dos itens — mesmo padrão de sales.totalCents.
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
