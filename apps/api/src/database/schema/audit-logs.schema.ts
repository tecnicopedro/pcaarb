import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

// Registro de ações sensíveis (troca de papel, override de permissão,
// assinatura/cancelamento, devolução de venda, reset de senha, bloqueio de
// conta). Alimentado por chamadas explícitas nos pontos sensíveis já
// identificados — não um interceptor global automático, pra manter a lista
// do que é auditado intencional e nunca logar corpo de requisição com
// senha/token por engano.
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  // Nula quando a ação não tem um usuário autenticado por trás (ex.:
  // bloqueio de conta disparado por tentativas de login — não sabemos quem
  // está tentando, só qual conta é o alvo).
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLogRow = typeof auditLogs.$inferInsert;
