import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';

// 'provider' only has 'mock' for now — there's no real Shopify/Mercado Livre
// account/credential yet (see docs/03 for the payment/fiscal equivalent).
// Adding a real provider means writing a new adapter that implements
// MarketplaceProvider, just like PaymentProvider/FiscalProvider.
export const marketplaceChannels = pgTable('marketplace_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('mock'),
  name: text('name').notNull(),
  // Store identifier on the marketplace side — returned by the provider at
  // connection time. In the mock it's just a stable placeholder, with no real handshake.
  externalStoreId: text('external_store_id').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MarketplaceChannelRow = typeof marketplaceChannels.$inferSelect;
export type NewMarketplaceChannelRow = typeof marketplaceChannels.$inferInsert;
