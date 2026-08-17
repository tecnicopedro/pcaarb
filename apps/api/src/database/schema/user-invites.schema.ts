import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { roleEnum } from './users.schema';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

// Tabela de identidade/onboarding, como refresh_tokens e users: o accept
// precisa localizar o convite ANTES de qualquer contexto de tenant existir
// (ver tenant-context.ts), então fica fora do RLS de propósito. Isolamento
// vem do id (UUID) + hash do token, igual refresh_tokens.
export const userInvites = pgTable('user_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: roleEnum('role').notNull(),
  tokenHash: text('token_hash').notNull(),
  invitedByUserId: uuid('invited_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserInviteRow = typeof userInvites.$inferSelect;
export type NewUserInviteRow = typeof userInvites.$inferInsert;
