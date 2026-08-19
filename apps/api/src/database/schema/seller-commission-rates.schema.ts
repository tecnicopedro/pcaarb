import { pgTable, uuid, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

// Per-seller override of the default rate in commission_settings — not a
// ledger table: commission is calculated on demand in the report by
// aggregating sales, not a balance table that needs transactional
// consistency with the sale.
export const sellerCommissionRates = pgTable(
  'seller_commission_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rateBps: integer('rate_bps').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUserUnique: uniqueIndex('seller_commission_rates_tenant_user_unique').on(table.tenantId, table.userId),
  }),
);

export type SellerCommissionRateRow = typeof sellerCommissionRates.$inferSelect;
export type NewSellerCommissionRateRow = typeof sellerCommissionRates.$inferInsert;
