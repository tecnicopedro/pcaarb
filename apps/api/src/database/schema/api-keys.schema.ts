import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

// No RLS, on purpose — same reason as users/tenants/refresh_tokens (see
// tenant-context.ts): validating a key happens BEFORE any tenant context
// exists (the auth guard only knows the tenant AFTER finding the key by
// its hash), so RLS here would block authentication itself.
// Isolation between tenants on the management routes (list/create/revoke) is
// guaranteed by the explicit tenant_id filter in ApiKeysService, the same
// pattern as UsersService.listByTenant.
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // Linked service account (see users.schema.ts) — it's the "who" that the
    // key impersonates for the rest of the system (CASL, audit FKs, etc.).
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Plain-text prefix (e.g. "pcaarb_live_a1b2c3d4") only to display/
    // identify the key in the UI without ever storing the full secret.
    keyPrefix: text('key_prefix').notNull(),
    // SHA-256 of the full secret — not bcrypt: the key is already born with
    // 192 bits of random entropy (not a guessable human password), so a fast,
    // deterministic hash is the right choice for this case (the same
    // rationale GitHub/Stripe use for API tokens), and it allows lookup by
    // direct equality without iterating row by row comparing with bcrypt.compare.
    keyHash: text('key_hash').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: uuid('revoked_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyHashUnique: uniqueIndex('api_keys_key_hash_unique').on(table.keyHash),
  }),
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
