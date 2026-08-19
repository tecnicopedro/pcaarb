import { pgTable, uuid, text, integer, boolean, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core';
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
    // Service account linked to an API key (see api-keys.schema.ts):
    // a real row in `users`, not a synthetic principal, because
    // several tables have a NOT NULL FK to users.id (sales.seller_id,
    // stock_movements.user_id...) — this way every action taken via an API key
    // satisfies those FKs for free, without needing to audit/change each one.
    // Never actually logs in (the password is random garbage that's never
    // revealed) and is left out of the human user listing (see UsersService.listByTenant).
    isServiceAccount: boolean('is_service_account').notNull().default(false),
    // User deactivation (LGPD/employee management) — same pattern as
    // products.active/stores.active, never a hard DELETE: a user has FKs
    // in sales/stock/cash register/audit all over the place, deleting would
    // destroy business history. Login is blocked when false.
    active: boolean('active').notNull().default(true),
    // Account lockout for login attempts — complements (doesn't replace)
    // the endpoint's per-IP rate limit: blocks by ACCOUNT even if the attacker
    // distributes attempts across multiple IPs. Reset to zero on every successful login.
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
