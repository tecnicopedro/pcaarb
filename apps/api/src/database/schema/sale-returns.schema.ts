import { pgTable, uuid, integer, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { sales } from './sales.schema';
import { users } from './users.schema';
import { cashSessions } from './cash-sessions.schema';
import { fiscalDocuments } from './fiscal-documents.schema';

export const saleReturnRefundMethodEnum = pgEnum('sale_return_refund_method', [
  'dinheiro',
  'estorno_pagamento',
  'outro',
]);

export const saleReturnStatusEnum = pgEnum('sale_return_status', ['completed', 'needs_attention']);

// A return (full or partial) of a sale that's already completed. Never
// edits the original sale (sale_items is an immutable snapshot, same
// rationale as always) — instead it records what was returned and reverses
// side effects (stock, points, cash register, fiscal) within the same
// transaction.
export const saleReturns = pgTable('sale_returns', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  saleId: uuid('sale_id')
    .notNull()
    .references(() => sales.id),
  processedBy: uuid('processed_by')
    .notNull()
    .references(() => users.id),
  // Null when refundMethod isn't 'dinheiro'. The session of whoever is
  // processing the return now — not necessarily the same session as the
  // original sale, which may have already closed.
  cashSessionId: uuid('cash_session_id').references(() => cashSessions.id),
  refundMethod: saleReturnRefundMethodEnum('refund_method').notNull(),
  reason: text('reason').notNull(),
  status: saleReturnStatusEnum('status').notNull(),
  // Filled in only when status = 'needs_attention' (same pattern as
  // marketplace_orders.issue) — never blank when something wasn't fully
  // applied, so the reason never has to be guessed later.
  issue: text('issue'),
  totalRefundedCents: integer('total_refunded_cents').notNull(),
  // Filled in only when NFC-e cancellation was attempted (return of the
  // entire sale with an authorized fiscal document).
  fiscalDocumentId: uuid('fiscal_document_id').references(() => fiscalDocuments.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SaleReturnRow = typeof saleReturns.$inferSelect;
export type NewSaleReturnRow = typeof saleReturns.$inferInsert;
