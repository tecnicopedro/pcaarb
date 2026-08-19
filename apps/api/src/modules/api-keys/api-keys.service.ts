import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { and, desc, eq } from 'drizzle-orm';
import type { ApiKey, CreateApiKeyInput, CreatedApiKey, JwtPayload, Role } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { apiKeys, users, type ApiKeyRow } from '../../database/schema/index';
import { canAssignApiKeyRole } from './role-rank';

// Stable, recognizable prefix (same rationale as Stripe/GitHub keys) — helps
// identify a PCAARB secret leaked by accident (e.g. by a repository secret
// scanner) and is how the auth guard distinguishes an API key from a JWT
// without having to try decoding both formats.
export const API_KEY_PREFIX = 'pcaarb_live_';
const BCRYPT_ROUNDS = 12;

function generateRawKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
}

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

function toApiKeyDto(row: ApiKeyRow, role: Role): ApiKey {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    role,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ApiKeysService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(tenantId: string): Promise<ApiKey[]> {
    const rows = await this.db
      .select({ apiKey: apiKeys, role: users.role })
      .from(apiKeys)
      .innerJoin(users, eq(users.id, apiKeys.userId))
      .where(eq(apiKeys.tenantId, tenantId))
      .orderBy(desc(apiKeys.createdAt));
    return rows.map((row) => toApiKeyDto(row.apiKey, row.role));
  }

  // actingRole is read fresh from the database by the controller (it does
  // not trust the JWT's role, which may be stale) — same precaution as
  // UsersService.inviteUser, same reason: without this, an admin who was
  // demoted after their token was issued could still mint a key with the
  // owner role.
  async create(tenantId: string, createdByUserId: string, actingRole: Role, input: CreateApiKeyInput): Promise<CreatedApiKey> {
    // No one can mint a key with more privilege than they already have —
    // and not just for the owner case (security review finding from
    // 2026-08-18: the 'Integration' subject guarding this endpoint was
    // already excluded from permissionSubjectSchema for being overridable
    // and allowing this path; this check is the second layer, not the
    // only one).
    if (!canAssignApiKeyRole(actingRole, input.role)) {
      throw new ForbiddenException('Você não pode criar uma chave de API com papel maior que o seu');
    }
    if (input.expiresAt && new Date(input.expiresAt) <= new Date()) {
      throw new BadRequestException('Data de expiração precisa estar no futuro');
    }

    const rawKey = generateRawKey();
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, API_KEY_PREFIX.length + 8);

    return this.db.transaction(async (tx) => {
      const [serviceUser] = await tx
        .insert(users)
        .values({
          tenantId,
          name: `Chave de API — ${input.name}`,
          email: `apikey+${randomUUID()}@keys.pcaarb.internal`,
          // Never revealed to anyone — the service account doesn't log in
          // with a password, it only exists to satisfy FKs and to be
          // resolved by CASL.
          passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), BCRYPT_ROUNDS),
          role: input.role,
          isServiceAccount: true,
        })
        .returning();
      if (!serviceUser) {
        throw new Error('Falha ao criar conta de serviço da chave de API');
      }

      const [apiKey] = await tx
        .insert(apiKeys)
        .values({
          tenantId,
          userId: serviceUser.id,
          name: input.name,
          keyPrefix,
          keyHash,
          createdByUserId,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        })
        .returning();
      if (!apiKey) {
        throw new Error('Falha ao criar chave de API');
      }

      return { ...toApiKeyDto(apiKey, serviceUser.role), rawKey };
    });
  }

  async revoke(tenantId: string, id: string, revokedByUserId: string): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, tenantId)))
      .limit(1);
    if (!existing) {
      throw new NotFoundException('Chave de API não encontrada');
    }
    if (existing.revokedAt) {
      throw new ConflictException('Chave de API já foi revogada');
    }
    await this.db.update(apiKeys).set({ revokedAt: new Date(), revokedByUserId }).where(eq(apiKeys.id, id));
  }

  // Authentication path (see JwtAuthGuard) — runs BEFORE any tenant context
  // exists, so it queries directly by keyHash (globally unique), without
  // runWithTenant/RLS. Same rationale as UsersService.findByEmail at login.
  async validate(rawKey: string): Promise<JwtPayload | null> {
    const keyHash = hashKey(rawKey);
    const [row] = await this.db
      .select({ apiKey: apiKeys, user: users })
      .from(apiKeys)
      .innerJoin(users, eq(users.id, apiKeys.userId))
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);
    if (!row) {
      return null;
    }
    if (row.apiKey.revokedAt) {
      return null;
    }
    if (row.apiKey.expiresAt && row.apiKey.expiresAt < new Date()) {
      return null;
    }

    void this.touchLastUsed(row.apiKey.id);

    return { sub: row.user.id, tenantId: row.user.tenantId, role: row.user.role };
  }

  // Best-effort: a failure here (e.g. a spike in database connections) must
  // not take down the authentication of a request that already validated
  // successfully.
  private async touchLastUsed(apiKeyId: string): Promise<void> {
    try {
      await this.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKeyId));
    } catch {
      // see comment above
    }
  }
}
