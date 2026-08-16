import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type {
  CreateFinanceEntryInput,
  FinanceCashflowSummary,
  UpdateFinanceEntryInput,
} from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { customers, suppliers, financeEntries, type FinanceEntryRow } from '../../database/schema/index';

@Injectable()
export class FinanceService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list(tenantId: string): Promise<FinanceEntryRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(financeEntries)
        .where(eq(financeEntries.tenantId, tenantId))
        .orderBy(financeEntries.dueDate, desc(financeEntries.createdAt)),
    );
  }

  async findByIdOrThrow(tenantId: string, id: string): Promise<FinanceEntryRow> {
    const entry = await runWithTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(financeEntries)
        .where(and(eq(financeEntries.id, id), eq(financeEntries.tenantId, tenantId)))
        .limit(1);
      return row;
    });
    if (!entry) {
      throw new NotFoundException('Conta não encontrada');
    }
    return entry;
  }

  create(tenantId: string, userId: string, input: CreateFinanceEntryInput): Promise<FinanceEntryRow> {
    if (input.type === 'receivable' && input.supplierId) {
      throw new BadRequestException('Conta a receber não pode referenciar um fornecedor');
    }
    if (input.type === 'payable' && input.customerId) {
      throw new BadRequestException('Conta a pagar não pode referenciar um cliente');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      if (input.customerId) {
        await this.assertCustomerExists(tx, tenantId, input.customerId);
      }
      if (input.supplierId) {
        await this.assertSupplierExists(tx, tenantId, input.supplierId);
      }

      const [entry] = await tx
        .insert(financeEntries)
        .values({
          tenantId,
          type: input.type,
          description: input.description,
          amountCents: input.amountCents,
          dueDate: input.dueDate,
          customerId: input.customerId ?? null,
          supplierId: input.supplierId ?? null,
          createdBy: userId,
        })
        .returning();
      if (!entry) {
        throw new Error('Falha ao criar conta');
      }
      return entry;
    });
  }

  async update(tenantId: string, id: string, input: UpdateFinanceEntryInput): Promise<FinanceEntryRow> {
    const existing = await this.findByIdOrThrow(tenantId, id);
    if (existing.status !== 'pending') {
      throw new ConflictException('Só é possível editar contas pendentes');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      if (input.customerId) {
        await this.assertCustomerExists(tx, tenantId, input.customerId);
      }
      if (input.supplierId) {
        await this.assertSupplierExists(tx, tenantId, input.supplierId);
      }

      const [entry] = await tx
        .update(financeEntries)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(financeEntries.id, id), eq(financeEntries.tenantId, tenantId)))
        .returning();
      if (!entry) {
        throw new NotFoundException('Conta não encontrada');
      }
      return entry;
    });
  }

  async pay(tenantId: string, id: string): Promise<FinanceEntryRow> {
    const existing = await this.findByIdOrThrow(tenantId, id);
    if (existing.status !== 'pending') {
      throw new ConflictException('Esta conta não está pendente');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      const [entry] = await tx
        .update(financeEntries)
        .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
        .where(and(eq(financeEntries.id, id), eq(financeEntries.tenantId, tenantId)))
        .returning();
      if (!entry) {
        throw new NotFoundException('Conta não encontrada');
      }
      return entry;
    });
  }

  async cancel(tenantId: string, id: string): Promise<FinanceEntryRow> {
    const existing = await this.findByIdOrThrow(tenantId, id);
    if (existing.status !== 'pending') {
      throw new ConflictException('Só é possível cancelar contas pendentes');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      const [entry] = await tx
        .update(financeEntries)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(and(eq(financeEntries.id, id), eq(financeEntries.tenantId, tenantId)))
        .returning();
      if (!entry) {
        throw new NotFoundException('Conta não encontrada');
      }
      return entry;
    });
  }

  async cashflowSummary(tenantId: string): Promise<FinanceCashflowSummary> {
    const entries = await this.list(tenantId);
    const today = new Date().toISOString().slice(0, 10);

    const summary: FinanceCashflowSummary = {
      pendingReceivableCents: 0,
      pendingPayableCents: 0,
      overdueReceivableCents: 0,
      overduePayableCents: 0,
      paidReceivableCents: 0,
      paidPayableCents: 0,
      netCents: 0,
    };

    for (const entry of entries) {
      if (entry.status === 'pending') {
        const isOverdue = entry.dueDate < today;
        if (entry.type === 'receivable') {
          summary.pendingReceivableCents += entry.amountCents;
          if (isOverdue) summary.overdueReceivableCents += entry.amountCents;
        } else {
          summary.pendingPayableCents += entry.amountCents;
          if (isOverdue) summary.overduePayableCents += entry.amountCents;
        }
      } else if (entry.status === 'paid') {
        if (entry.type === 'receivable') {
          summary.paidReceivableCents += entry.amountCents;
        } else {
          summary.paidPayableCents += entry.amountCents;
        }
      }
    }

    summary.netCents = summary.paidReceivableCents - summary.paidPayableCents;
    return summary;
  }

  private async assertCustomerExists(tx: Database, tenantId: string, customerId: string): Promise<void> {
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
      .limit(1);
    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }
  }

  private async assertSupplierExists(tx: Database, tenantId: string, supplierId: string): Promise<void> {
    const [supplier] = await tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId), eq(suppliers.tenantId, tenantId)))
      .limit(1);
    if (!supplier) {
      throw new NotFoundException('Fornecedor não encontrado');
    }
  }
}
