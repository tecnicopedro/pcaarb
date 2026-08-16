import { pgTable, uuid, integer, text } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { sales } from './sales.schema';
import { products } from './products.schema';

export const saleItems = pgTable('sale_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Denormalizado (também existe via sales.tenant_id) de propósito: mantém a
  // policy de RLS simples e idêntica à das outras tabelas, sem precisar de
  // subquery via JOIN em sale_id a cada checagem de linha.
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  saleId: uuid('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  // Snapshot do nome/preço no momento da venda: preço do produto pode mudar
  // depois, mas o histórico da venda não pode.
  productName: text('product_name').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  quantity: integer('quantity').notNull(),
  totalCents: integer('total_cents').notNull(),
});

export type SaleItemRow = typeof saleItems.$inferSelect;
export type NewSaleItemRow = typeof saleItems.$inferInsert;
