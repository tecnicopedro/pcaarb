import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';

// Toda venda/caixa acontece em uma loja — mesmo tenant em plano Starter/
// Profissional (uma loja só) tem uma linha aqui, criada automaticamente no
// registro (ver TenantsService.registerWithOwner). Criar uma 2ª loja é
// restrito ao plano Multi-loja (ver BillingService/StoresService) — é
// literalmente o que esse plano vende.
export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type StoreRow = typeof stores.$inferSelect;
export type NewStoreRow = typeof stores.$inferInsert;
