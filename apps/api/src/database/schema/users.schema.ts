import { pgTable, uuid, text, boolean, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';

export const roleEnum = pgEnum('user_role', ['owner', 'admin', 'operador_caixa', 'financeiro']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull().default('operador_caixa'),
    // Conta de serviço vinculada a uma chave de API (ver api-keys.schema.ts):
    // uma linha de verdade em `users`, não um principal sintético, porque
    // várias tabelas têm FK NOT NULL pra users.id (sales.seller_id,
    // stock_movements.user_id...) — assim toda ação feita via chave de API
    // satisfaz essas FKs de graça, sem precisar auditar/alterar cada uma.
    // Nunca loga de verdade (senha é lixo aleatório nunca revelado) e fica
    // fora da listagem humana de usuários (ver UsersService.listByTenant).
    isServiceAccount: boolean('is_service_account').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
