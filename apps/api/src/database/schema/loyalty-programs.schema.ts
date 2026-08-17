import { pgTable, uuid, integer, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';

// Uma linha por tenant (upsert-on-read no service) — não um catálogo de
// "programas" plural, só a configuração do programa de fidelidade do tenant.
export const loyaltyPrograms = pgTable(
  'loyalty_programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    active: boolean('active').notNull().default(true),
    // Pontos ganhos a cada R$1 (100 centavos) gastos.
    earnRatePoints: integer('earn_rate_points').notNull().default(1),
    // Valor em centavos de 1 ponto no resgate.
    redeemValueCents: integer('redeem_value_cents').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUnique: uniqueIndex('loyalty_programs_tenant_unique').on(table.tenantId),
  }),
);

export type LoyaltyProgramRow = typeof loyaltyPrograms.$inferSelect;
export type NewLoyaltyProgramRow = typeof loyaltyPrograms.$inferInsert;
