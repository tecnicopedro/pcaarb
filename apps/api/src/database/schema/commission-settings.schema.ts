import { pgTable, uuid, integer, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';

// One row per tenant (upsert-on-read in the service), same pattern as
// loyalty_programs — the default commission rate applied to sellers
// without an individual rate in seller_commission_rates.
export const commissionSettings = pgTable(
  'commission_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    active: boolean('active').notNull().default(true),
    // Basis points (1/100 of 1%): 500 = 5%. Integer to avoid floating
    // point, same rationale as earn_rate_points/redeem_value_cents.
    defaultRateBps: integer('default_rate_bps').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUnique: uniqueIndex('commission_settings_tenant_unique').on(table.tenantId),
  }),
);

export type CommissionSettingsRow = typeof commissionSettings.$inferSelect;
export type NewCommissionSettingsRow = typeof commissionSettings.$inferInsert;
