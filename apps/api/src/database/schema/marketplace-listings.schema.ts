import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { marketplaceChannels } from './marketplace-channels.schema';
import { products } from './products.schema';

export const marketplaceListingStatusEnum = pgEnum('marketplace_listing_status', ['pending', 'synced', 'error']);

// Vínculo entre um produto do PCAARB e sua publicação em um canal externo —
// é essa tabela que resolve um pedido importado (externalProductId) de volta
// pro produto local, pra decrementar o estoque certo.
export const marketplaceListings = pgTable(
  'marketplace_listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => marketplaceChannels.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    // Nulo até a primeira sincronização com sucesso.
    externalProductId: text('external_product_id'),
    status: marketplaceListingStatusEnum('status').notNull().default('pending'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncError: text('last_sync_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    channelProductUnique: uniqueIndex('marketplace_listings_channel_product_unique').on(table.channelId, table.productId),
    // NULL é distinto no Postgres — várias listagens 'pending' (sem
    // externalProductId ainda) convivem, mas uma vez sincronizada, o id
    // externo não pode apontar pra dois produtos locais ao mesmo tempo.
    channelExternalProductUnique: uniqueIndex('marketplace_listings_channel_external_product_unique').on(
      table.channelId,
      table.externalProductId,
    ),
  }),
);

export type MarketplaceListingRow = typeof marketplaceListings.$inferSelect;
export type NewMarketplaceListingRow = typeof marketplaceListings.$inferInsert;
