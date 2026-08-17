import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { CustomerLoyaltyBalance, UpdateLoyaltyProgramInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  customers,
  loyaltyLedgerEntries,
  loyaltyPrograms,
  type LoyaltyLedgerEntryRow,
  type LoyaltyProgramRow,
} from '../../database/schema/index';
import { calculatePointsEarned } from '../sales/sale-calculations';

@Injectable()
export class LoyaltyService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getProgram(tenantId: string): Promise<LoyaltyProgramRow> {
    return runWithTenant(this.db, tenantId, (tx) => this.getOrCreateProgramTx(tx, tenantId));
  }

  async updateProgram(tenantId: string, input: UpdateLoyaltyProgramInput): Promise<LoyaltyProgramRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      await this.getOrCreateProgramTx(tx, tenantId);
      const [updated] = await tx
        .update(loyaltyPrograms)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(loyaltyPrograms.tenantId, tenantId))
        .returning();
      if (!updated) {
        throw new Error('Falha ao atualizar configuração de fidelidade');
      }
      return updated;
    });
  }

  async getBalance(tenantId: string, customerId: string): Promise<CustomerLoyaltyBalance> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      await this.assertCustomerExistsTx(tx, tenantId, customerId);
      const balancePoints = await this.getBalanceTx(tx, tenantId, customerId);
      const program = await this.getOrCreateProgramTx(tx, tenantId);
      return { customerId, balancePoints, balanceValueCents: balancePoints * program.redeemValueCents };
    });
  }

  async listLedger(tenantId: string, customerId: string): Promise<LoyaltyLedgerEntryRow[]> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      await this.assertCustomerExistsTx(tx, tenantId, customerId);
      return tx
        .select()
        .from(loyaltyLedgerEntries)
        .where(and(eq(loyaltyLedgerEntries.tenantId, tenantId), eq(loyaltyLedgerEntries.customerId, customerId)))
        .orderBy(desc(loyaltyLedgerEntries.createdAt));
    });
  }

  // --- Reaproveitado pelo SalesService dentro da própria transação da venda,
  // pro resgate/ganho de pontos serem atômicos com a venda (ou tudo, ou nada).

  async getOrCreateProgramTx(tx: Database, tenantId: string): Promise<LoyaltyProgramRow> {
    const [existing] = await tx.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.tenantId, tenantId)).limit(1);
    if (existing) {
      return existing;
    }
    const [created] = await tx
      .insert(loyaltyPrograms)
      .values({ tenantId })
      .onConflictDoNothing({ target: loyaltyPrograms.tenantId })
      .returning();
    if (created) {
      return created;
    }
    // Corrida rara: outra transação criou a linha entre o select e o insert.
    const [afterRace] = await tx.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.tenantId, tenantId)).limit(1);
    if (!afterRace) {
      throw new Error('Falha ao criar configuração de fidelidade');
    }
    return afterRace;
  }

  async getBalanceTx(tx: Database, tenantId: string, customerId: string): Promise<number> {
    const rows = await tx
      .select({ points: loyaltyLedgerEntries.points })
      .from(loyaltyLedgerEntries)
      .where(and(eq(loyaltyLedgerEntries.tenantId, tenantId), eq(loyaltyLedgerEntries.customerId, customerId)));
    return rows.reduce((sum, row) => sum + row.points, 0);
  }

  async redeemTx(
    tx: Database,
    params: { tenantId: string; customerId: string; saleId: string; points: number },
  ): Promise<void> {
    const balance = await this.getBalanceTx(tx, params.tenantId, params.customerId);
    if (params.points > balance) {
      throw new BadRequestException(
        `Cliente tem apenas ${balance} ponto(s) de fidelidade disponível(is), tentou resgatar ${params.points}`,
      );
    }
    await tx.insert(loyaltyLedgerEntries).values({
      tenantId: params.tenantId,
      customerId: params.customerId,
      saleId: params.saleId,
      type: 'redeem',
      points: -params.points,
    });
  }

  async earnTx(
    tx: Database,
    params: { tenantId: string; customerId: string; saleId: string; netPaidCents: number; program: LoyaltyProgramRow },
  ): Promise<number> {
    if (!params.program.active) {
      return 0;
    }
    const points = calculatePointsEarned(params.netPaidCents, params.program.earnRatePoints);
    if (points <= 0) {
      return 0;
    }
    await tx.insert(loyaltyLedgerEntries).values({
      tenantId: params.tenantId,
      customerId: params.customerId,
      saleId: params.saleId,
      type: 'earn',
      points,
    });
    return points;
  }

  private async assertCustomerExistsTx(tx: Database, tenantId: string, customerId: string): Promise<void> {
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
      .limit(1);
    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }
  }
}
