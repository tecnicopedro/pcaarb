import { pgTable, uuid, integer, text, boolean } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { saleReturns } from './sale-returns.schema';
import { saleItems } from './sale-items.schema';
import { products } from './products.schema';

// Uma linha devolvida. Sempre inserida, mesmo quando `applied = false` (uma
// devolução rejeitada não grava nada — ver SaleReturnsService — mas se no
// futuro o tudo-ou-nada virar por linha, o padrão já está pronto, mesmo
// raciocínio de marketplace_order_items).
export const saleReturnItems = pgTable('sale_return_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Denormalizado (também existe via sale_returns.tenant_id) de propósito:
  // mantém a policy de RLS simples e idêntica à das outras tabelas, mesmo
  // racional de sale_items.
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  saleReturnId: uuid('sale_return_id')
    .notNull()
    .references(() => saleReturns.id, { onDelete: 'cascade' }),
  saleItemId: uuid('sale_item_id')
    .notNull()
    .references(() => saleItems.id),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  quantity: integer('quantity').notNull(),
  // Snapshot do preço unitário da linha original (sale_items.unit_price_cents).
  unitPriceCents: integer('unit_price_cents').notNull(),
  // Valor efetivamente reembolsado desta linha, já rateado por eventual
  // desconto/resgate da venda original — ver SaleReturnsService.
  refundedCents: integer('refunded_cents').notNull(),
  applied: boolean('applied').notNull().default(true),
  issue: text('issue'),
});

export type SaleReturnItemRow = typeof saleReturnItems.$inferSelect;
export type NewSaleReturnItemRow = typeof saleReturnItems.$inferInsert;
