import { pgTable, uuid, text, integer, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { categories } from './categories.schema';

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    sku: text('sku'),
    name: text('name').notNull(),
    description: text('description'),
    unit: text('unit').notNull().default('un'),
    priceCents: integer('price_cents').notNull(),
    costPriceCents: integer('cost_price_cents'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // NULL é tratado como distinto pelo Postgres: vários produtos sem SKU
    // convivem tranquilamente, mas SKUs informados não podem repetir no tenant.
    tenantSkuUnique: uniqueIndex('products_tenant_sku_unique').on(table.tenantId, table.sku),
  }),
);

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
