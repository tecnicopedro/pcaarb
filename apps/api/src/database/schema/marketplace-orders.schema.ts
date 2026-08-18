import { pgTable, uuid, text, integer, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { marketplaceChannels } from './marketplace-channels.schema';

export const marketplaceOrderStatusEnum = pgEnum('marketplace_order_status', ['imported', 'needs_attention']);

// Um pedido feito no marketplace, puxado via MarketplaceProvider.fetchNewOrders.
// A unique em (channelId, externalOrderId) é a chave de idempotência: um
// retry de sincronização que devolva o mesmo pedido de novo não duplica o
// abate de estoque (ver MarketplaceOrdersService.pullOrders).
export const marketplaceOrders = pgTable(
  'marketplace_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => marketplaceChannels.id, { onDelete: 'cascade' }),
    externalOrderId: text('external_order_id').notNull(),
    totalCents: integer('total_cents').notNull(),
    status: marketplaceOrderStatusEnum('status').notNull(),
    // Preenchido só quando status = 'needs_attention': produto não mapeado,
    // inativo, ou estoque insuficiente — nunca fica em branco quando o
    // pedido não foi aplicado, pra nunca precisar adivinhar o motivo depois.
    issue: text('issue'),
    importedAt: timestamp('imported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    channelExternalOrderUnique: uniqueIndex('marketplace_orders_channel_external_order_unique').on(
      table.channelId,
      table.externalOrderId,
    ),
  }),
);

export type MarketplaceOrderRow = typeof marketplaceOrders.$inferSelect;
export type NewMarketplaceOrderRow = typeof marketplaceOrders.$inferInsert;
