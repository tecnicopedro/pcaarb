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

// Uma devolução (total ou parcial) de uma venda já concluída. Nunca edita a
// venda original (sale_items é snapshot imutável, mesmo racional de sempre)
// — em vez disso registra o que foi devolvido e reverte efeitos colaterais
// (estoque, pontos, caixa, fiscal) na mesma transação.
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
  // Nula quando refundMethod não é 'dinheiro'. Sessão de quem está
  // processando a devolução agora — não necessariamente a mesma sessão da
  // venda original, que pode já ter fechado.
  cashSessionId: uuid('cash_session_id').references(() => cashSessions.id),
  refundMethod: saleReturnRefundMethodEnum('refund_method').notNull(),
  reason: text('reason').notNull(),
  status: saleReturnStatusEnum('status').notNull(),
  // Preenchido só quando status = 'needs_attention' (mesmo padrão de
  // marketplace_orders.issue) — nunca em branco quando algo não foi
  // aplicado por completo, pra nunca precisar adivinhar o motivo depois.
  issue: text('issue'),
  totalRefundedCents: integer('total_refunded_cents').notNull(),
  // Preenchido só quando o cancelamento de NFC-e foi tentado (devolução da
  // venda inteira com documento fiscal autorizado).
  fiscalDocumentId: uuid('fiscal_document_id').references(() => fiscalDocuments.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SaleReturnRow = typeof saleReturns.$inferSelect;
export type NewSaleReturnRow = typeof saleReturns.$inferInsert;
