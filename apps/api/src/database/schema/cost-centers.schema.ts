import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';

export const costCenters = pgTable('cost_centers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // Sem exclusão definitiva — mesma regra de produto — porque finance_entries
  // pode referenciar um centro de custo já "desativado" no histórico.
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CostCenterRow = typeof costCenters.$inferSelect;
export type NewCostCenterRow = typeof costCenters.$inferInsert;
