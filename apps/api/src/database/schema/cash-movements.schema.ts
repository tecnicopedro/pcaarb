import { pgTable, uuid, integer, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';
import { cashSessions } from './cash-sessions.schema';

// 'estorno' (cash refund for a sale return) was added after
// sangria/suprimento (cash withdrawal/cash deposit) — see SaleReturnsService.
export const cashMovementTypeEnum = pgEnum('cash_movement_type', ['sangria', 'suprimento', 'estorno']);

export const cashMovements = pgTable('cash_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  cashSessionId: uuid('cash_session_id')
    .notNull()
    .references(() => cashSessions.id, { onDelete: 'cascade' }),
  type: cashMovementTypeEnum('type').notNull(),
  amountCents: integer('amount_cents').notNull(),
  reason: text('reason'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CashMovementRow = typeof cashMovements.$inferSelect;
export type NewCashMovementRow = typeof cashMovements.$inferInsert;
