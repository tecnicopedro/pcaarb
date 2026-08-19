import { pgTable, uuid, integer, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';

// One row per tenant (upsert-on-read in the service) — not a catalog of
// plural "programs", just the tenant's loyalty program configuration.
export const loyaltyPrograms = pgTable(
  'loyalty_programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    active: boolean('active').notNull().default(true),
    // Points earned for every R$1 (100 cents) spent.
    earnRatePoints: integer('earn_rate_points').notNull().default(1),
    // Value in cents of 1 point on redemption.
    redeemValueCents: integer('redeem_value_cents').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUnique: uniqueIndex('loyalty_programs_tenant_unique').on(table.tenantId),
  }),
);

export type LoyaltyProgramRow = typeof loyaltyPrograms.$inferSelect;
export type NewLoyaltyProgramRow = typeof loyaltyPrograms.$inferInsert;
