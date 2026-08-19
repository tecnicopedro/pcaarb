import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

// Tabela de identidade, mesmo grupo de refresh_tokens/user_invites: localizar
// o token acontece antes de qualquer contexto de tenant existir, então fica
// fora do RLS de propósito. Isolamento vem do id (UUID) + hash do token.
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  // TTL bem mais curto que o convite (7 dias) — fluxo de segurança de uma
  // conta já existente, não onboarding.
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetTokenRow = typeof passwordResetTokens.$inferInsert;
