import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

// Log of sensitive actions (role change, permission override,
// subscription/cancellation, sale return, password reset, account
// lockout). Populated by explicit calls at the sensitive points already
// identified — not an automatic global interceptor, to keep the list
// of what's audited intentional and never accidentally log a request
// body containing a password/token.
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  // Null when the action doesn't have an authenticated user behind it (e.g.
  // account lockout triggered by login attempts — we don't know who is
  // trying, only which account is the target).
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLogRow = typeof auditLogs.$inferInsert;
