import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { marketplaceChannels } from './marketplace-channels.schema';
import { products } from './products.schema';

export const marketplaceListingStatusEnum = pgEnum('marketplace_listing_status', ['pending', 'synced', 'error']);

// Link between a PCAARB product and its listing on an external channel —
// this is the table that resolves an imported order (externalProductId) back
// to the local product, to decrement the correct stock.
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
    // Null until the first successful sync.
    externalProductId: text('external_product_id'),
    status: marketplaceListingStatusEnum('status').notNull().default('pending'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncError: text('last_sync_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    channelProductUnique: uniqueIndex('marketplace_listings_channel_product_unique').on(table.channelId, table.productId),
    // NULL is distinct in Postgres — several 'pending' listings (without
    // externalProductId yet) can coexist, but once synced, the external id
    // can't point to two local products at the same time.
    channelExternalProductUnique: uniqueIndex('marketplace_listings_channel_external_product_unique').on(
      table.channelId,
      table.externalProductId,
    ),
  }),
);

export type MarketplaceListingRow = typeof marketplaceListings.$inferSelect;
export type NewMarketplaceListingRow = typeof marketplaceListings.$inferInsert;
