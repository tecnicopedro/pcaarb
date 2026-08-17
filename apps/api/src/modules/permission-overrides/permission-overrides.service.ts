import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { CreatePermissionOverrideInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { users, userPermissionOverrides, type UserPermissionOverrideRow } from '../../database/schema/index';

@Injectable()
export class PermissionOverridesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(tenantId: string, userId: string): Promise<UserPermissionOverrideRow[]> {
    await this.assertTargetExists(tenantId, userId);
    return this.db
      .select()
      .from(userPermissionOverrides)
      .where(and(eq(userPermissionOverrides.tenantId, tenantId), eq(userPermissionOverrides.userId, userId)));
  }

  async create(
    tenantId: string,
    userId: string,
    createdBy: string,
    input: CreatePermissionOverrideInput,
  ): Promise<UserPermissionOverrideRow> {
    await this.assertTargetIsOverridable(tenantId, userId);

    // Upsert: uma nova regra pro mesmo (subject, action) substitui a anterior
    // em vez de acumular duas linhas conflitantes pro mesmo par.
    const [override] = await this.db
      .insert(userPermissionOverrides)
      .values({ tenantId, userId, subject: input.subject, action: input.action, effect: input.effect, createdBy })
      .onConflictDoUpdate({
        target: [
          userPermissionOverrides.tenantId,
          userPermissionOverrides.userId,
          userPermissionOverrides.subject,
          userPermissionOverrides.action,
        ],
        set: { effect: input.effect, createdBy },
      })
      .returning();
    if (!override) {
      throw new Error('Falha ao criar exceção de permissão');
    }
    return override;
  }

  async remove(tenantId: string, userId: string, overrideId: string): Promise<void> {
    const [override] = await this.db
      .select({ id: userPermissionOverrides.id })
      .from(userPermissionOverrides)
      .where(
        and(
          eq(userPermissionOverrides.id, overrideId),
          eq(userPermissionOverrides.tenantId, tenantId),
          eq(userPermissionOverrides.userId, userId),
        ),
      )
      .limit(1);
    if (!override) {
      throw new NotFoundException('Exceção de permissão não encontrada');
    }
    await this.db.delete(userPermissionOverrides).where(eq(userPermissionOverrides.id, overrideId));
  }

  private async assertTargetExists(tenantId: string, userId: string): Promise<{ role: string }> {
    const [target] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);
    if (!target) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return target;
  }

  // Owner nunca é alvo de override — precisa continuar com acesso total
  // garantido, é a rede de segurança de todo o resto do RBAC (ver regra de
  // "sempre existe ao menos um owner" em UsersService.updateRole).
  private async assertTargetIsOverridable(tenantId: string, userId: string): Promise<void> {
    const target = await this.assertTargetExists(tenantId, userId);
    if (target.role === 'owner') {
      throw new BadRequestException('Não é possível criar exceções de permissão para um owner');
    }
  }
}
