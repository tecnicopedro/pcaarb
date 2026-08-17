import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

export const permissionEffectEnum = pgEnum('permission_effect', ['allow', 'deny']);

// Tabela de identidade/controle de acesso, mesmo grupo de users/refresh_tokens
// (ver tenant-context.ts) — sem RLS de propósito. É consultada pela AbilityGuard
// em toda request autenticada; isolamento por tenant/usuário vem de FK + filtro
// explícito nas queries, não de policy de banco, pra evitar abrir uma transação
// extra nesse caminho quente.
export const userPermissionOverrides = pgTable(
  'user_permission_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // subject/action ficam como texto livre (não enum de banco): a lista de
    // subjects do CASL cresce por módulo (ver ability.factory.ts) e criar uma
    // migration toda vez que um módulo novo aparece seria atrito desnecessário
    // — a validação de valores permitidos acontece no Zod (packages/shared).
    subject: text('subject').notNull(),
    action: text('action').notNull(),
    effect: permissionEffectEnum('effect').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Um usuário só tem UMA regra por (subject, action) — criar de novo substitui.
    userSubjectActionUnique: uniqueIndex('user_permission_overrides_unique').on(
      table.tenantId,
      table.userId,
      table.subject,
      table.action,
    ),
  }),
);

export type UserPermissionOverrideRow = typeof userPermissionOverrides.$inferSelect;
export type NewUserPermissionOverrideRow = typeof userPermissionOverrides.$inferInsert;
