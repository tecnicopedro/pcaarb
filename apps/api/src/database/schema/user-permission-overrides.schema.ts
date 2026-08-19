import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

export const permissionEffectEnum = pgEnum('permission_effect', ['allow', 'deny']);

// Identity/access-control table, same group as users/refresh_tokens
// (see tenant-context.ts) — no RLS on purpose. It's queried by AbilityGuard
// on every authenticated request; isolation by tenant/user comes from FK +
// explicit filtering in the queries, not a database policy, to avoid opening
// an extra transaction on this hot path.
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
    // subject/action are kept as free text (not a database enum): the list of
    // CASL subjects grows per module (see ability.factory.ts) and creating a
    // migration every time a new module appears would be unnecessary friction
    // — validation of allowed values happens in Zod (packages/shared).
    subject: text('subject').notNull(),
    action: text('action').notNull(),
    effect: permissionEffectEnum('effect').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // A user only has ONE rule per (subject, action) — creating a new one replaces it.
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
