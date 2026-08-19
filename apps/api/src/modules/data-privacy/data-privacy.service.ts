import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  customers,
  sales,
  saleItems,
  salePayments,
  loyaltyLedgerEntries,
  financeEntries,
  type CustomerRow,
} from '../../database/schema/index';
import { AuditLogService } from '../audit-log/audit-log.service';

@Injectable()
export class DataPrivacyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditLogService: AuditLogService,
  ) {}

  // "Tudo sobre esta pessoa" — junta cliente + vendas (com itens/pagamentos)
  // + ledger de fidelidade + lançamentos financeiros ligados a ele. JSON puro
  // (não um CSV/relatório formatado): é um dump de portabilidade de dados,
  // não uma tela de negócio.
  async exportCustomerData(tenantId: string, customerId: string, actorUserId: string) {
    const result = await runWithTenant(this.db, tenantId, async (tx) => {
      const [customer] = await tx
        .select()
        .from(customers)
        .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
        .limit(1);
      if (!customer) {
        throw new NotFoundException('Cliente não encontrado');
      }

      const customerSales = await tx.select().from(sales).where(and(eq(sales.customerId, customerId), eq(sales.tenantId, tenantId)));
      const saleIds = customerSales.map((s) => s.id);
      const items = saleIds.length > 0 ? await tx.select().from(saleItems).where(inArray(saleItems.saleId, saleIds)) : [];
      const payments = saleIds.length > 0 ? await tx.select().from(salePayments).where(inArray(salePayments.saleId, saleIds)) : [];
      const loyaltyLedger = await tx
        .select()
        .from(loyaltyLedgerEntries)
        .where(and(eq(loyaltyLedgerEntries.customerId, customerId), eq(loyaltyLedgerEntries.tenantId, tenantId)));
      const financeHistory = await tx
        .select()
        .from(financeEntries)
        .where(and(eq(financeEntries.customerId, customerId), eq(financeEntries.tenantId, tenantId)));

      return {
        customer,
        sales: customerSales.map((sale) => ({
          ...sale,
          items: items.filter((item) => item.saleId === sale.id),
          payments: payments.filter((payment) => payment.saleId === sale.id),
        })),
        loyaltyLedger,
        financeEntries: financeHistory,
      };
    });

    await this.auditLogService.record({
      tenantId,
      actorUserId,
      action: 'data_privacy.customer_exported',
      targetType: 'Customer',
      targetId: customerId,
    });

    return result;
  }

  // Zera nome/documento/e-mail/telefone mas mantém o id — preserva
  // sales.customer_id/finance_entries.customer_id (histórico de venda e
  // fiscal precisa sobreviver ~5 anos por lei mesmo depois de um pedido de
  // exclusão) e loyalty_ledger_entries.customer_id (ledger é imutável por
  // design — um DELETE físico do cliente cascateia e destrói o histórico de
  // pontos, violando o próprio invariante documentado da tabela).
  async anonymizeCustomerData(tenantId: string, customerId: string, actorUserId: string | null): Promise<CustomerRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [customer] = await tx
        .update(customers)
        .set({ name: 'Cliente removido', document: null, email: null, phone: null })
        .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
        .returning();
      if (!customer) {
        throw new NotFoundException('Cliente não encontrado');
      }
      await this.auditLogService.recordTx(tx, {
        tenantId,
        actorUserId,
        action: 'data_privacy.customer_anonymized',
        targetType: 'Customer',
        targetId: customerId,
      });
      return customer;
    });
  }

  // Usado por CustomersService.remove() pra decidir entre apagar de verdade
  // (nada a perder) ou anonimizar em vez de apagar (preserva o histórico que
  // referencia o cliente).
  async hasHistory(tenantId: string, customerId: string): Promise<boolean> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [sale] = await tx
        .select({ id: sales.id })
        .from(sales)
        .where(and(eq(sales.customerId, customerId), eq(sales.tenantId, tenantId)))
        .limit(1);
      if (sale) return true;

      const [ledgerEntry] = await tx
        .select({ id: loyaltyLedgerEntries.id })
        .from(loyaltyLedgerEntries)
        .where(and(eq(loyaltyLedgerEntries.customerId, customerId), eq(loyaltyLedgerEntries.tenantId, tenantId)))
        .limit(1);
      if (ledgerEntry) return true;

      const [financeEntry] = await tx
        .select({ id: financeEntries.id })
        .from(financeEntries)
        .where(and(eq(financeEntries.customerId, customerId), eq(financeEntries.tenantId, tenantId)))
        .limit(1);
      return !!financeEntry;
    });
  }
}
