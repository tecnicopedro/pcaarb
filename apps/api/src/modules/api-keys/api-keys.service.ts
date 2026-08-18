import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { and, desc, eq } from 'drizzle-orm';
import type { ApiKey, CreateApiKeyInput, CreatedApiKey, JwtPayload, Role } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { apiKeys, users, type ApiKeyRow } from '../../database/schema/index';

// Prefixo estável e reconhecível (mesmo racional de chaves do Stripe/GitHub)
// — ajuda a identificar um segredo PCAARB vazado por engano (ex.: em scanner
// de segredo de repositório) e é como o guard de auth distingue uma chave de
// API de um JWT sem precisar tentar decodificar os dois formatos.
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

  // actingRole é lido fresco do banco pelo controller (não confia no papel
  // do JWT, que pode estar desatualizado) — mesmo cuidado de
  // UsersService.inviteUser, mesmo motivo: sem isso um admin rebaixado
  // depois de emitir o token ainda conseguiria mintar uma chave com papel
  // de owner.
  async create(tenantId: string, createdByUserId: string, actingRole: Role, input: CreateApiKeyInput): Promise<CreatedApiKey> {
    if (input.role === 'owner' && actingRole !== 'owner') {
      throw new ForbiddenException('Só um owner pode criar uma chave de API com papel de owner');
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
          // Nunca revelado a ninguém — a conta de serviço não loga por senha,
          // só existe pra satisfazer FKs e ser resolvida pelo CASL.
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

  // Caminho de autenticação (ver JwtAuthGuard) — roda ANTES de qualquer
  // contexto de tenant existir, então consulta direto por keyHash (único
  // globalmente), sem runWithTenant/RLS. Mesmo racional de
  // UsersService.findByEmail no login.
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

  // Best-effort: uma falha aqui (ex.: pico de conexões no banco) não pode
  // derrubar a autenticação da request que já foi validada com sucesso.
  private async touchLastUsed(apiKeyId: string): Promise<void> {
    try {
      await this.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKeyId));
    } catch {
      // ver comentário acima
    }
  }
}
