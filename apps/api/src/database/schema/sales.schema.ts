import { pgTable, uuid, integer, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';
import { customers } from './customers.schema';
import { cashSessions } from './cash-sessions.schema';
import { stores } from './stores.schema';

export const saleStatusEnum = pgEnum('sale_status', ['completed', 'canceled']);

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // Denormalizado a partir de cash_sessions.store_id no momento da venda
    // (mesmo racional de sale_items denormalizar nome/preço do produto) —
    // evita join pra relatório consolidado por loja, que é o valor real do
    // plano Multi-loja.
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    cashSessionId: uuid('cash_session_id')
      .notNull()
      .references(() => cashSessions.id),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => users.id),
    status: saleStatusEnum('status').notNull().default('completed'),
    subtotalCents: integer('subtotal_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    // Gerado no cliente (não no servidor) no momento em que o operador finaliza
    // a venda no PDV offline — é a chave de idempotência do PWA: sincronizar a
    // mesma venda enfileirada duas vezes (retry de rede, service worker
    // acordando de novo) devolve a venda já criada em vez de vender duas
    // vezes. Nulo em toda venda "normal" (online, sem fila) — NULL nunca
    // colide com NULL no índice único, então não muda nada pro fluxo existente.
    clientSaleId: uuid('client_sale_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantClientSaleIdUnique: uniqueIndex('sales_tenant_client_sale_id_unique').on(table.tenantId, table.clientSaleId),
  }),
);

export type SaleRow = typeof sales.$inferSelect;
export type NewSaleRow = typeof sales.$inferInsert;
