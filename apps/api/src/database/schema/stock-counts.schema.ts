import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

// open = count in progress, items can still be filled in; completed =
// finalized, generated the stock adjustments (see StockCountsService.finalize);
// canceled = only from open, doesn't touch stock.
export const stockCountStatusEnum = pgEnum('stock_count_status', ['open', 'completed', 'canceled']);

export const stockCounts = pgTable('stock_counts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  status: stockCountStatusEnum('status').notNull().default('open'),
  notes: text('notes'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export type StockCountRow = typeof stockCounts.$inferSelect;
export type NewStockCountRow = typeof stockCounts.$inferInsert;
