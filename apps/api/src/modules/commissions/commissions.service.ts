import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { UpdateCommissionSettingsInput, UpsertSellerCommissionRateInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  commissionSettings,
  sellerCommissionRates,
  users,
  type CommissionSettingsRow,
  type SellerCommissionRateRow,
} from '../../database/schema/index';

export interface SellerCommissionRateWithName extends SellerCommissionRateRow {
  sellerName: string;
}

@Injectable()
export class CommissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getSettings(tenantId: string): Promise<CommissionSettingsRow> {
    return runWithTenant(this.db, tenantId, (tx) => this.getOrCreateSettingsTx(tx, tenantId));
  }

  async updateSettings(tenantId: string, input: UpdateCommissionSettingsInput): Promise<CommissionSettingsRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      await this.getOrCreateSettingsTx(tx, tenantId);
      const [updated] = await tx
        .update(commissionSettings)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(commissionSettings.tenantId, tenantId))
        .returning();
      if (!updated) {
        throw new Error('Falha ao atualizar configuração de comissão');
      }
      return updated;
    });
  }

  async listRates(tenantId: string): Promise<SellerCommissionRateWithName[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx
        .select({
          id: sellerCommissionRates.id,
          tenantId: sellerCommissionRates.tenantId,
          userId: sellerCommissionRates.userId,
          rateBps: sellerCommissionRates.rateBps,
          createdAt: sellerCommissionRates.createdAt,
          updatedAt: sellerCommissionRates.updatedAt,
          sellerName: users.name,
        })
        .from(sellerCommissionRates)
        .innerJoin(users, eq(users.id, sellerCommissionRates.userId))
        .where(eq(sellerCommissionRates.tenantId, tenantId)),
    );
  }

  async upsertRate(
    tenantId: string,
    userId: string,
    input: UpsertSellerCommissionRateInput,
  ): Promise<SellerCommissionRateRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [seller] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
      if (!seller) {
        throw new NotFoundException('Vendedor não encontrado');
      }
      const [rate] = await tx
        .insert(sellerCommissionRates)
        .values({ tenantId, userId, rateBps: input.rateBps })
        .onConflictDoUpdate({
          target: [sellerCommissionRates.tenantId, sellerCommissionRates.userId],
          set: { rateBps: input.rateBps, updatedAt: new Date() },
        })
        .returning();
      if (!rate) {
        throw new Error('Falha ao salvar taxa de comissão do vendedor');
      }
      return rate;
    });
  }

  async removeRate(tenantId: string, userId: string): Promise<void> {
    await runWithTenant(this.db, tenantId, (tx) =>
      tx.delete(sellerCommissionRates).where(and(eq(sellerCommissionRates.tenantId, tenantId), eq(sellerCommissionRates.userId, userId))),
    );
  }

  // Reused by ReportsService: a userId -> rateBps map already resolved
  // (individual override, otherwise the tenant's default rate).
  async resolveRatesTx(tx: Database, tenantId: string, sellerIds: string[]): Promise<Map<string, number>> {
    const settings = await this.getOrCreateSettingsTx(tx, tenantId);
    const overrides = sellerIds.length
      ? await tx
          .select({ userId: sellerCommissionRates.userId, rateBps: sellerCommissionRates.rateBps })
          .from(sellerCommissionRates)
          .where(eq(sellerCommissionRates.tenantId, tenantId))
      : [];
    const overrideByUserId = new Map(overrides.map((row) => [row.userId, row.rateBps]));
    return new Map(sellerIds.map((sellerId) => [sellerId, overrideByUserId.get(sellerId) ?? settings.defaultRateBps]));
  }

  private async getOrCreateSettingsTx(tx: Database, tenantId: string): Promise<CommissionSettingsRow> {
    const [existing] = await tx.select().from(commissionSettings).where(eq(commissionSettings.tenantId, tenantId)).limit(1);
    if (existing) {
      return existing;
    }
    const [created] = await tx
      .insert(commissionSettings)
      .values({ tenantId })
      .onConflictDoNothing({ target: commissionSettings.tenantId })
      .returning();
    if (created) {
      return created;
    }
    const [afterRace] = await tx.select().from(commissionSettings).where(eq(commissionSettings.tenantId, tenantId)).limit(1);
    if (!afterRace) {
      throw new Error('Falha ao criar configuração de comissão');
    }
    return afterRace;
  }
}
