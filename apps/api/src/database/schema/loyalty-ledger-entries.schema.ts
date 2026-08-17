import { pgTable, uuid, integer, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { customers } from './customers.schema';
import { sales } from './sales.schema';
import { users } from './users.schema';

export const loyaltyLedgerTypeEnum = pgEnum('loyalty_ledger_type', ['earn', 'redeem', 'adjustment']);

// Ledger, não um saldo mutável: saldo do cliente é sempre SUM(points) desta
// tabela — mesmo raciocínio de sale_items ser snapshot, aqui é histórico
// imutável (nunca UPDATE/DELETE de uma entrada já gravada).
export const loyaltyLedgerEntries = pgTable('loyalty_ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  // Nula em ajuste manual — só entradas 'earn'/'redeem' nascem de uma venda.
  saleId: uuid('sale_id').references(() => sales.id),
  type: loyaltyLedgerTypeEnum('type').notNull(),
  // Sinalizado: 'earn'/ajuste-crédito é positivo, 'redeem'/ajuste-débito é
  // negativo. Saldo = soma direta, sem precisar olhar o "type" pra somar.
  points: integer('points').notNull(),
  note: text('note'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LoyaltyLedgerEntryRow = typeof loyaltyLedgerEntries.$inferSelect;
export type NewLoyaltyLedgerEntryRow = typeof loyaltyLedgerEntries.$inferInsert;
