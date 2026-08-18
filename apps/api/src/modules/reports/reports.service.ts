import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import type {
  AbcCurveItem,
  CommissionReport,
  DreSummary,
  ProductRankingItem,
  ReportPeriodQuery,
  SalesSummary,
  SellerRankingItem,
  StoreRankingItem,
} from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  sales,
  saleItems,
  users,
  financeEntries,
  costCenters,
  stores,
  customers,
  suppliers,
  salePayments,
  fiscalDocuments,
  type SaleRow,
} from '../../database/schema/index';
import { CommissionsService } from '../commissions/commissions.service';
import { toCsv } from '../../common/utils/csv';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix: 'Pix',
};

const FISCAL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  authorized: 'Autorizada',
  rejected: 'Rejeitada',
};

interface ResolvedRange {
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
}

// Sem período informado, mostra os últimos 30 dias — janela padrão razoável
// pra um lojista abrir o relatório e já ver algo útil sem precisar configurar nada.
const DEFAULT_RANGE_DAYS = 30;

function resolveRange(query: ReportPeriodQuery): ResolvedRange {
  const toDate = query.to ? new Date(`${query.to}T23:59:59.999Z`) : new Date();
  const fromDate = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : new Date(toDate.getTime() - (DEFAULT_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000);
  return { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10), fromDate, toDate };
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly commissionsService: CommissionsService,
  ) {}

  async summary(tenantId: string, query: ReportPeriodQuery): Promise<SalesSummary> {
    const range = resolveRange(query);
    const salesInRange = await this.completedSalesInRange(tenantId, range);
    const totalRevenueCents = salesInRange.reduce((sum, sale) => sum + sale.totalCents, 0);
    const totalSales = salesInRange.length;
    return {
      from: range.from,
      to: range.to,
      totalSales,
      totalRevenueCents,
      averageTicketCents: totalSales > 0 ? Math.round(totalRevenueCents / totalSales) : 0,
    };
  }

  async productRanking(tenantId: string, query: ReportPeriodQuery, limit = 20): Promise<ProductRankingItem[]> {
    const items = await this.aggregatedProductRevenue(tenantId, query);
    return items.slice(0, limit);
  }

  async abcCurve(tenantId: string, query: ReportPeriodQuery): Promise<AbcCurveItem[]> {
    const items = await this.aggregatedProductRevenue(tenantId, query);
    const totalRevenueCents = items.reduce((sum, item) => sum + item.revenueCents, 0);
    if (totalRevenueCents === 0) {
      return [];
    }

    let cumulativeSharePercent = 0;
    return items.map((item) => {
      const revenueSharePercent = (item.revenueCents / totalRevenueCents) * 100;
      cumulativeSharePercent += revenueSharePercent;
      // Curva ABC clássica: A cobre até 80% da receita acumulada, B até 95%, C o resto.
      const klass: AbcCurveItem['class'] = cumulativeSharePercent <= 80 ? 'A' : cumulativeSharePercent <= 95 ? 'B' : 'C';
      return { ...item, revenueSharePercent, cumulativeSharePercent, class: klass };
    });
  }

  async sellerRanking(tenantId: string, query: ReportPeriodQuery): Promise<SellerRankingItem[]> {
    const range = resolveRange(query);
    const salesInRange = await this.completedSalesInRange(tenantId, range);
    if (salesInRange.length === 0) {
      return [];
    }

    const sellerIds = [...new Set(salesInRange.map((sale) => sale.sellerId))];
    const sellerRows = await runWithTenant(this.db, tenantId, (tx) =>
      tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, sellerIds)),
    );
    const nameById = new Map(sellerRows.map((seller) => [seller.id, seller.name]));

    const bySeller = new Map<string, { totalSales: number; revenueCents: number }>();
    for (const sale of salesInRange) {
      const acc = bySeller.get(sale.sellerId) ?? { totalSales: 0, revenueCents: 0 };
      acc.totalSales += 1;
      acc.revenueCents += sale.totalCents;
      bySeller.set(sale.sellerId, acc);
    }

    return [...bySeller.entries()]
      .map(([sellerId, acc]) => ({
        sellerId,
        sellerName: nameById.get(sellerId) ?? 'Desconhecido',
        totalSales: acc.totalSales,
        revenueCents: acc.revenueCents,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents);
  }

  // Visão consolidada multi-loja — o valor real do plano Multi-loja (ver
  // PRECOS-E-CUSTOS.md). Mesmo formato de sellerRanking, agrupado por loja
  // em vez de vendedor; funciona igual para tenant de loja única (retorna
  // uma linha só).
  async storeRanking(tenantId: string, query: ReportPeriodQuery): Promise<StoreRankingItem[]> {
    const range = resolveRange(query);
    const salesInRange = await this.completedSalesInRange(tenantId, range);
    if (salesInRange.length === 0) {
      return [];
    }

    const storeIds = [...new Set(salesInRange.map((sale) => sale.storeId))];
    const storeRows = await runWithTenant(this.db, tenantId, (tx) =>
      tx.select({ id: stores.id, name: stores.name }).from(stores).where(inArray(stores.id, storeIds)),
    );
    const nameById = new Map(storeRows.map((store) => [store.id, store.name]));

    const byStore = new Map<string, { totalSales: number; revenueCents: number }>();
    for (const sale of salesInRange) {
      const acc = byStore.get(sale.storeId) ?? { totalSales: 0, revenueCents: 0 };
      acc.totalSales += 1;
      acc.revenueCents += sale.totalCents;
      byStore.set(sale.storeId, acc);
    }

    return [...byStore.entries()]
      .map(([storeId, acc]) => ({
        storeId,
        storeName: nameById.get(storeId) ?? 'Desconhecida',
        totalSales: acc.totalSales,
        revenueCents: acc.revenueCents,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents);
  }

  // Comissão calculada sob demanda (não é ledger): agrega a receita por
  // vendedor no período e aplica a taxa resolvida (override individual em
  // seller_commission_rates, senão a taxa padrão do tenant).
  async commissionReport(tenantId: string, query: ReportPeriodQuery): Promise<CommissionReport> {
    const range = resolveRange(query);
    const salesInRange = await this.completedSalesInRange(tenantId, range);
    if (salesInRange.length === 0) {
      return { from: range.from, to: range.to, totalCommissionCents: 0, porVendedor: [] };
    }

    const sellerIds = [...new Set(salesInRange.map((sale) => sale.sellerId))];
    const bySeller = new Map<string, { totalSales: number; revenueCents: number }>();
    for (const sale of salesInRange) {
      const acc = bySeller.get(sale.sellerId) ?? { totalSales: 0, revenueCents: 0 };
      acc.totalSales += 1;
      acc.revenueCents += sale.totalCents;
      bySeller.set(sale.sellerId, acc);
    }

    const { sellerRows, rateBySeller } = await runWithTenant(this.db, tenantId, async (tx) => {
      const rows = await tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, sellerIds));
      const rates = await this.commissionsService.resolveRatesTx(tx, tenantId, sellerIds);
      return { sellerRows: rows, rateBySeller: rates };
    });
    const nameById = new Map(sellerRows.map((seller) => [seller.id, seller.name]));

    const porVendedor = [...bySeller.entries()]
      .map(([sellerId, acc]) => {
        const rateBps = rateBySeller.get(sellerId) ?? 0;
        return {
          sellerId,
          sellerName: nameById.get(sellerId) ?? 'Desconhecido',
          totalSales: acc.totalSales,
          revenueCents: acc.revenueCents,
          rateBps,
          commissionCents: Math.round((acc.revenueCents * rateBps) / 10_000),
        };
      })
      .sort((a, b) => b.commissionCents - a.commissionCents);

    return {
      from: range.from,
      to: range.to,
      totalCommissionCents: porVendedor.reduce((sum, item) => sum + item.commissionCents, 0),
      porVendedor,
    };
  }

  // DRE simplificado em regime de caixa (só o que já foi efetivamente pago),
  // não de competência — mais simples e mais honesto pro estágio atual do
  // produto, que não tem conciliação bancária real ainda.
  async dre(tenantId: string, query: ReportPeriodQuery): Promise<DreSummary> {
    const range = resolveRange(query);

    const paidEntries = await runWithTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(financeEntries)
        .where(
          and(
            eq(financeEntries.tenantId, tenantId),
            eq(financeEntries.status, 'paid'),
            isNotNull(financeEntries.paidAt),
            gte(financeEntries.paidAt, range.fromDate),
            lte(financeEntries.paidAt, range.toDate),
          ),
        ),
    );

    const costCenterRows = await runWithTenant(this.db, tenantId, (tx) =>
      tx.select({ id: costCenters.id, name: costCenters.name }).from(costCenters).where(eq(costCenters.tenantId, tenantId)),
    );
    const nameById = new Map(costCenterRows.map((cc) => [cc.id, cc.name]));

    const byCostCenter = new Map<string, { costCenterId: string | null; costCenterName: string; receitasCents: number; despesasCents: number }>();
    let receitasCents = 0;
    let despesasCents = 0;

    for (const entry of paidEntries) {
      const key = entry.costCenterId ?? 'sem-centro-de-custo';
      const acc = byCostCenter.get(key) ?? {
        costCenterId: entry.costCenterId,
        costCenterName: entry.costCenterId ? (nameById.get(entry.costCenterId) ?? 'Desconhecido') : 'Sem centro de custo',
        receitasCents: 0,
        despesasCents: 0,
      };
      if (entry.type === 'receivable') {
        acc.receitasCents += entry.amountCents;
        receitasCents += entry.amountCents;
      } else {
        acc.despesasCents += entry.amountCents;
        despesasCents += entry.amountCents;
      }
      byCostCenter.set(key, acc);
    }

    const porCentroDeCusto = [...byCostCenter.values()]
      .map((acc) => ({ ...acc, resultadoCents: acc.receitasCents - acc.despesasCents }))
      .sort((a, b) => b.receitasCents + b.despesasCents - (a.receitasCents + a.despesasCents));

    return {
      from: range.from,
      to: range.to,
      receitasCents,
      despesasCents,
      resultadoCents: receitasCents - despesasCents,
      porCentroDeCusto,
    };
  }

  // Exportação para contabilidade — não é escrituração fiscal (SPED), é o
  // dado bruto (vendas com forma de pagamento e status do documento fiscal,
  // contas pagas/a pagar) num formato que qualquer contador consegue importar
  // na ferramenta dele. Emitir SPED de verdade exige validação de quem
  // entende a legislação tributária caso a caso; isso aqui é seguro de
  // automatizar, aquilo não é.
  async exportSalesCsv(tenantId: string, query: ReportPeriodQuery): Promise<string> {
    const range = resolveRange(query);
    const salesInRange = await this.completedSalesInRange(tenantId, range);
    if (salesInRange.length === 0) {
      return toCsv(
        ['Data', 'Hora', 'ID da venda', 'Loja', 'Vendedor', 'Cliente', 'Subtotal', 'Desconto', 'Total', 'Formas de pagamento', 'Status fiscal', 'Chave de acesso NFC-e'],
        [],
      );
    }

    const saleIds = salesInRange.map((sale) => sale.id);
    const storeIds = [...new Set(salesInRange.map((sale) => sale.storeId))];
    const sellerIds = [...new Set(salesInRange.map((sale) => sale.sellerId))];
    const customerIds = [...new Set(salesInRange.map((sale) => sale.customerId).filter((id): id is string => !!id))];

    const { storeRows, sellerRows, customerRows, paymentRows, fiscalRows } = await runWithTenant(this.db, tenantId, async (tx) => {
      const [storeRows, sellerRows, customerRows, paymentRows, fiscalRows] = await Promise.all([
        tx.select({ id: stores.id, name: stores.name }).from(stores).where(inArray(stores.id, storeIds)),
        tx.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, sellerIds)),
        customerIds.length > 0
          ? tx.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, customerIds))
          : Promise.resolve([]),
        tx.select().from(salePayments).where(and(eq(salePayments.tenantId, tenantId), inArray(salePayments.saleId, saleIds))),
        tx.select().from(fiscalDocuments).where(and(eq(fiscalDocuments.tenantId, tenantId), inArray(fiscalDocuments.saleId, saleIds))),
      ]);
      return { storeRows, sellerRows, customerRows, paymentRows, fiscalRows };
    });

    const storeNameById = new Map(storeRows.map((s) => [s.id, s.name]));
    const sellerNameById = new Map(sellerRows.map((s) => [s.id, s.name]));
    const customerNameById = new Map(customerRows.map((c) => [c.id, c.name]));
    const paymentsBySale = new Map<string, typeof paymentRows>();
    for (const payment of paymentRows) {
      const list = paymentsBySale.get(payment.saleId) ?? [];
      list.push(payment);
      paymentsBySale.set(payment.saleId, list);
    }
    const fiscalBySale = new Map(fiscalRows.map((f) => [f.saleId, f]));

    const rows = salesInRange
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((sale) => {
        const paymentsLabel = (paymentsBySale.get(sale.id) ?? [])
          .map((p) => `${PAYMENT_METHOD_LABELS[p.method] ?? p.method}: R$ ${(p.amountCents / 100).toFixed(2)}`)
          .join(' + ');
        const fiscal = fiscalBySale.get(sale.id);
        return [
          sale.createdAt.toISOString().slice(0, 10),
          sale.createdAt.toISOString().slice(11, 19),
          sale.id,
          storeNameById.get(sale.storeId) ?? '',
          sellerNameById.get(sale.sellerId) ?? '',
          sale.customerId ? (customerNameById.get(sale.customerId) ?? '') : '',
          (sale.subtotalCents / 100).toFixed(2),
          (sale.discountCents / 100).toFixed(2),
          (sale.totalCents / 100).toFixed(2),
          paymentsLabel,
          fiscal ? (FISCAL_STATUS_LABELS[fiscal.status] ?? fiscal.status) : 'Não emitida',
          fiscal?.accessKey ?? '',
        ];
      });

    return toCsv(
      ['Data', 'Hora', 'ID da venda', 'Loja', 'Vendedor', 'Cliente', 'Subtotal', 'Desconto', 'Total', 'Formas de pagamento', 'Status fiscal', 'Chave de acesso NFC-e'],
      rows,
    );
  }

  async exportFinanceCsv(tenantId: string, query: ReportPeriodQuery): Promise<string> {
    const range = resolveRange(query);
    // Aqui usa data de vencimento (due_date), não paidAt como o DRE — a
    // exportação contábil precisa mostrar tudo que está lançado no período
    // (pago, pendente ou cancelado), não só o que já liquidou.
    const entries = await runWithTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(financeEntries)
        .where(
          and(
            eq(financeEntries.tenantId, tenantId),
            gte(financeEntries.dueDate, range.from),
            lte(financeEntries.dueDate, range.to),
          ),
        ),
    );

    const header = ['Tipo', 'Descrição', 'Valor', 'Vencimento', 'Status', 'Pago em', 'Cliente/Fornecedor', 'Centro de custo'];
    if (entries.length === 0) {
      return toCsv(header, []);
    }

    const customerIds = [...new Set(entries.map((e) => e.customerId).filter((id): id is string => !!id))];
    const supplierIds = [...new Set(entries.map((e) => e.supplierId).filter((id): id is string => !!id))];
    const costCenterIds = [...new Set(entries.map((e) => e.costCenterId).filter((id): id is string => !!id))];

    const { customerRows, supplierRows, costCenterRows } = await runWithTenant(this.db, tenantId, async (tx) => {
      const [customerRows, supplierRows, costCenterRows] = await Promise.all([
        customerIds.length > 0
          ? tx.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, customerIds))
          : Promise.resolve([]),
        supplierIds.length > 0
          ? tx.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(inArray(suppliers.id, supplierIds))
          : Promise.resolve([]),
        costCenterIds.length > 0
          ? tx.select({ id: costCenters.id, name: costCenters.name }).from(costCenters).where(inArray(costCenters.id, costCenterIds))
          : Promise.resolve([]),
      ]);
      return { customerRows, supplierRows, costCenterRows };
    });
    const customerNameById = new Map(customerRows.map((c) => [c.id, c.name]));
    const supplierNameById = new Map(supplierRows.map((s) => [s.id, s.name]));
    const costCenterNameById = new Map(costCenterRows.map((c) => [c.id, c.name]));

    const statusLabels: Record<string, string> = { pending: 'Pendente', paid: 'Paga', canceled: 'Cancelada' };

    const rows = entries
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((entry) => [
        entry.type === 'receivable' ? 'Receita' : 'Despesa',
        entry.description,
        (entry.amountCents / 100).toFixed(2),
        entry.dueDate,
        statusLabels[entry.status] ?? entry.status,
        entry.paidAt ? entry.paidAt.toISOString().slice(0, 10) : '',
        entry.customerId ? (customerNameById.get(entry.customerId) ?? '') : entry.supplierId ? (supplierNameById.get(entry.supplierId) ?? '') : '',
        entry.costCenterId ? (costCenterNameById.get(entry.costCenterId) ?? '') : '',
      ]);

    return toCsv(header, rows);
  }

  private async completedSalesInRange(tenantId: string, range: ResolvedRange): Promise<SaleRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(sales)
        .where(
          and(
            eq(sales.tenantId, tenantId),
            eq(sales.status, 'completed'),
            gte(sales.createdAt, range.fromDate),
            lte(sales.createdAt, range.toDate),
          ),
        ),
    );
  }

  private async aggregatedProductRevenue(tenantId: string, query: ReportPeriodQuery): Promise<ProductRankingItem[]> {
    const range = resolveRange(query);
    const salesInRange = await this.completedSalesInRange(tenantId, range);
    if (salesInRange.length === 0) {
      return [];
    }

    const saleIds = salesInRange.map((sale) => sale.id);
    const items = await runWithTenant(this.db, tenantId, (tx) =>
      tx.select().from(saleItems).where(and(eq(saleItems.tenantId, tenantId), inArray(saleItems.saleId, saleIds))),
    );

    const byProduct = new Map<string, { productName: string; quantitySold: number; revenueCents: number }>();
    for (const item of items) {
      const acc = byProduct.get(item.productId) ?? { productName: item.productName, quantitySold: 0, revenueCents: 0 };
      acc.quantitySold += item.quantity;
      acc.revenueCents += item.totalCents;
      byProduct.set(item.productId, acc);
    }

    return [...byProduct.entries()]
      .map(([productId, acc]) => ({ productId, ...acc }))
      .sort((a, b) => b.revenueCents - a.revenueCents);
  }
}
