import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';

// Sem RLS, de propósito — mesmo motivo de users/tenants/refresh_tokens (ver
// tenant-context.ts): validar uma chave acontece ANTES de qualquer contexto
// de tenant existir (o guard de auth só sabe o tenant DEPOIS de achar a
// chave pelo hash), então RLS aqui bloquearia a própria autenticação.
// Isolamento entre tenants nas rotas de gestão (listar/criar/revogar) é
// garantido pelo filtro explícito de tenant_id em ApiKeysService, mesmo
// padrão de UsersService.listByTenant.
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // Conta de serviço vinculada (ver users.schema.ts) — é o "quem" que a
    // chave impersona pro resto do sistema (CASL, FKs de auditoria etc.).
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Prefixo em texto puro (ex.: "pcaarb_live_a1b2c3d4") só pra exibir/
    // identificar a chave na UI sem nunca guardar o segredo completo.
    keyPrefix: text('key_prefix').notNull(),
    // SHA-256 do segredo completo — não bcrypt: a chave já nasce com 192 bits
    // de entropia aleatória (não é senha humana adivinhável), então um hash
    // rápido e determinístico é o padrão certo pra esse caso (mesmo racional
    // do GitHub/Stripe pra token de API), e permite buscar por igualdade
    // direta sem iterar linha por linha comparando com bcrypt.compare.
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
