import { pgTable, uuid, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

export const cashSessionStatusEnum = pgEnum('cash_session_status', ['open', 'closed']);

export const cashSessions = pgTable('cash_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  openedBy: uuid('opened_by')
    .notNull()
    .references(() => users.id),
  openingAmountCents: integer('opening_amount_cents').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedBy: uuid('closed_by').references(() => users.id),
  closingAmountCents: integer('closing_amount_cents'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  status: cashSessionStatusEnum('status').notNull().default('open'),
});

export type CashSessionRow = typeof cashSessions.$inferSelect;
export type NewCashSessionRow = typeof cashSessions.$inferInsert;
