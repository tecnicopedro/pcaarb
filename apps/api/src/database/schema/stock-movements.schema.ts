import { pgTable, uuid, integer, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';
import { products } from './products.schema';
import { sales } from './sales.schema';

export const stockMovementTypeEnum = pgEnum('stock_movement_type', ['entrada', 'saida', 'ajuste']);

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  type: stockMovementTypeEnum('type').notNull(),
  // Delta assinado já aplicado ao saldo (negativo em saída), não a magnitude
  // informada pelo usuário — soma direta do ledger reconstrói o saldo.
  quantity: integer('quantity').notNull(),
  reason: text('reason'),
  // Preenchido só quando o movimento é gerado automaticamente por uma venda.
  saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type StockMovementRow = typeof stockMovements.$inferSelect;
export type NewStockMovementRow = typeof stockMovements.$inferInsert;
