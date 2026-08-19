import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { roleEnum } from './users.schema';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

// Identity/onboarding table, like refresh_tokens and users: accept
// needs to locate the invite BEFORE any tenant context exists
// (see tenant-context.ts), so it's kept outside RLS on purpose. Isolation
// comes from the id (UUID) + token hash, same as refresh_tokens.
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
