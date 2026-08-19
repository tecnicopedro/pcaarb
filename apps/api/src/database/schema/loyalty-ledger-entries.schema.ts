import { pgTable, uuid, integer, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { customers } from './customers.schema';
import { sales } from './sales.schema';
import { users } from './users.schema';

export const loyaltyLedgerTypeEnum = pgEnum('loyalty_ledger_type', ['earn', 'redeem', 'adjustment']);

// Ledger, not a mutable balance: the customer's balance is always SUM(points)
// from this table — same reasoning as sale_items being a snapshot, here it's
// an immutable history (never UPDATE/DELETE an entry already written).
export const loyaltyLedgerEntries = pgTable('loyalty_ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  // Null on a manual adjustment — only 'earn'/'redeem' entries originate from a sale.
  saleId: uuid('sale_id').references(() => sales.id),
  type: loyaltyLedgerTypeEnum('type').notNull(),
  // Signed: 'earn'/credit-adjustment is positive, 'redeem'/debit-adjustment is
  // negative. Balance = direct sum, without needing to look at "type" to add up.
  points: integer('points').notNull(),
  note: text('note'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LoyaltyLedgerEntryRow = typeof loyaltyLedgerEntries.$inferSelect;
export type NewLoyaltyLedgerEntryRow = typeof loyaltyLedgerEntries.$inferInsert;
