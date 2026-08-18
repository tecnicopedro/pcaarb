import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';

// 'provider' só tem 'mock' por enquanto — não existe conta/credencial real de
// Shopify/Mercado Livre ainda (ver docs/03 pro equivalente em pagamento/
// fiscal). Adicionar um provider de verdade é escrever um novo adapter que
// implemente MarketplaceProvider, igual PaymentProvider/FiscalProvider.
export const marketplaceChannels = pgTable('marketplace_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('mock'),
  name: text('name').notNull(),
  // Identificador da loja no lado do marketplace — devolvido pelo provider no
  // momento da conexão. No mock é só um placeholder estável, sem handshake real.
  externalStoreId: text('external_store_id').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MarketplaceChannelRow = typeof marketplaceChannels.$inferSelect;
export type NewMarketplaceChannelRow = typeof marketplaceChannels.$inferInsert;
