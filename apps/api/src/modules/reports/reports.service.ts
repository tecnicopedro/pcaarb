import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import type {
  AbcCurveItem,
  CommissionReport,
  DreSummary,
  PricingSuggestionItem,
  PricingSuggestionQuery,
  ProductRankingItem,
  ReorderSuggestionItem,
  ReorderSuggestionQuery,
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
  saleReturns,
  saleReturnItems,
  users,
  financeEntries,
  costCenters,
  stores,
  customers,
  suppliers,
  salePayments,
  fiscalDocuments,
  products,
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

// With no period given, shows the last 30 days — a reasonable default
// window for a merchant to open the report and already see something
// useful without having to configure anything.
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
    const refundedBySale = await this.refundedCentsBySale(
      tenantId,
      salesInRange.map((sale) => sale.id),
    );
    const totalRevenueCents = salesInRange.reduce((sum, sale) => sum + sale.totalCents - (refundedBySale.get(sale.id) ?? 0), 0);
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
      // Classic ABC curve: A covers up to 80% of cumulative revenue, B up to 95%, C the rest.
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
    const refundedBySale = await this.refundedCentsBySale(
      tenantId,
      salesInRange.map((sale) => sale.id),
    );

    const bySeller = new Map<string, { totalSales: number; revenueCents: number }>();
    for (const sale of salesInRange) {
      const acc = bySeller.get(sale.sellerId) ?? { totalSales: 0, revenueCents: 0 };
      acc.totalSales += 1;
      acc.revenueCents += sale.totalCents - (refundedBySale.get(sale.id) ?? 0);
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

  // Consolidated multi-store view — the real value of the Multi-store plan
  // (see PRECOS-E-CUSTOS.md). Same format as sellerRanking, grouped by
  // store instead of seller; works the same for a single-store tenant
  // (returns just one row).
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
    const refundedBySale = await this.refundedCentsBySale(
      tenantId,
      salesInRange.map((sale) => sale.id),
    );

    const byStore = new Map<string, { totalSales: number; revenueCents: number }>();
    for (const sale of salesInRange) {
      const acc = byStore.get(sale.storeId) ?? { totalSales: 0, revenueCents: 0 };
      acc.totalSales += 1;
      acc.revenueCents += sale.totalCents - (refundedBySale.get(sale.id) ?? 0);
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

  // Commission calculated on demand (not a ledger): aggregates revenue by
  // seller for the period and applies the resolved rate (individual
  // override in seller_commission_rates, otherwise the tenant's default
  // rate).
  async commissionReport(tenantId: string, query: ReportPeriodQuery): Promise<CommissionReport> {
    const range = resolveRange(query);
    const salesInRange = await this.completedSalesInRange(tenantId, range);
    if (salesInRange.length === 0) {
      return { from: range.from, to: range.to, totalCommissionCents: 0, porVendedor: [] };
    }

    const sellerIds = [...new Set(salesInRange.map((sale) => sale.sellerId))];
    const refundedBySale = await this.refundedCentsBySale(
      tenantId,
      salesInRange.map((sale) => sale.id),
    );
    const bySeller = new Map<string, { totalSales: number; revenueCents: number }>();
    for (const sale of salesInRange) {
      const acc = bySeller.get(sale.sellerId) ?? { totalSales: 0, revenueCents: 0 };
      acc.totalSales += 1;
      acc.revenueCents += sale.totalCents - (refundedBySale.get(sale.id) ?? 0);
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

  // Simplified DRE (income statement) on a cash basis (only what has
  // actually been paid), not accrual — simpler and more honest for the
  // product's current stage, which doesn't have real bank reconciliation
  // yet.
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

  // Export for accounting — not fiscal bookkeeping (SPED), it's raw data
  // (sales with payment method and fiscal document status, paid/payable
  // accounts) in a format any accountant can import into their own tool.
  // Actually issuing SPED requires validation from someone who understands
  // tax law case by case; this is safe to automate, that isn't.
  async exportSalesCsv(tenantId: string, query: ReportPeriodQuery): Promise<string> {
    const range = resolveRange(query);
    const salesInRange = await this.completedSalesInRange(tenantId, range);
    const csvHeader = [
      'Data',
      'Hora',
      'ID da venda',
      'Loja',
      'Vendedor',
      'Cliente',
      'Subtotal',
      'Desconto',
      'Total',
      'Valor devolvido',
      'Formas de pagamento',
      'Status fiscal',
      'Chave de acesso NFC-e',
    ];
    if (salesInRange.length === 0) {
      return toCsv(csvHeader, []);
    }

    const saleIds = salesInRange.map((sale) => sale.id);
    const storeIds = [...new Set(salesInRange.map((sale) => sale.storeId))];
    const sellerIds = [...new Set(salesInRange.map((sale) => sale.sellerId))];
    const customerIds = [...new Set(salesInRange.map((sale) => sale.customerId).filter((id): id is string => !!id))];
    const refundedBySale = await this.refundedCentsBySale(tenantId, saleIds);

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
          ((refundedBySale.get(sale.id) ?? 0) / 100).toFixed(2),
          paymentsLabel,
          fiscal ? (FISCAL_STATUS_LABELS[fiscal.status] ?? fiscal.status) : 'Não emitida',
          fiscal?.accessKey ?? '',
        ];
      });

    return toCsv(csvHeader, rows);
  }

  async exportFinanceCsv(tenantId: string, query: ReportPeriodQuery): Promise<string> {
    const range = resolveRange(query);
    // Here it uses the due date (due_date), not paidAt like the DRE — the
    // accounting export needs to show everything booked in the period
    // (paid, pending, or canceled), not just what has already settled.
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

  // Demand forecast via simple moving average (quantity sold in the period
  // / days in the period) — not a time-series model with
  // seasonality/trend, it's an honest heuristic based on what the PDV
  // already records. A product with no sales in the period and a positive
  // stock balance is excluded (there's no data at all to base a suggestion
  // on); a zero balance is always included, even without a recent sale,
  // because "it's at zero" is already actionable on its own.
  async reorderSuggestions(tenantId: string, query: ReorderSuggestionQuery): Promise<ReorderSuggestionItem[]> {
    const range = resolveRange(query);
    const coverageDays = query.coverageDays ?? 14;
    const alertDays = query.alertDays ?? 7;
    const windowDays = Math.max(1, Math.round((range.toDate.getTime() - range.fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);

    const salesInRange = await this.completedSalesInRange(tenantId, range);
    const quantityByProduct = new Map<string, number>();
    if (salesInRange.length > 0) {
      const saleIds = salesInRange.map((sale) => sale.id);
      const items = await runWithTenant(this.db, tenantId, (tx) =>
        tx.select().from(saleItems).where(and(eq(saleItems.tenantId, tenantId), inArray(saleItems.saleId, saleIds))),
      );
      const returnedByItem = await this.returnedByLineItem(
        tenantId,
        items.map((item) => item.id),
      );
      for (const item of items) {
        const returnedQuantity = returnedByItem.get(item.id)?.quantity ?? 0;
        quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity - returnedQuantity);
      }
    }

    const trackedProducts = await runWithTenant(this.db, tenantId, (tx) =>
      tx
        .select({ id: products.id, name: products.name, stockQuantity: products.stockQuantity })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.active, true), eq(products.trackStock, true))),
    );

    const results = trackedProducts
      .map((product) => {
        const quantitySold = quantityByProduct.get(product.id) ?? 0;
        const avgDailySales = quantitySold / windowDays;
        const daysUntilStockout = avgDailySales > 0 ? product.stockQuantity / avgDailySales : null;
        const suggestedReorderQty = avgDailySales > 0 ? Math.max(0, Math.ceil(avgDailySales * coverageDays) - product.stockQuantity) : 0;
        const needsAttention = product.stockQuantity <= 0 || (daysUntilStockout !== null && daysUntilStockout <= alertDays);
        return {
          productId: product.id,
          productName: product.name,
          stockQuantity: product.stockQuantity,
          avgDailySales: Math.round(avgDailySales * 100) / 100,
          daysUntilStockout: daysUntilStockout !== null ? Math.round(daysUntilStockout * 10) / 10 : null,
          suggestedReorderQty,
          needsAttention,
        };
      })
      .filter((item) => item.avgDailySales > 0 || item.stockQuantity <= 0);

    return results.sort((a, b) => {
      if (a.daysUntilStockout === null && b.daysUntilStockout === null) return 0;
      if (a.daysUntilStockout === null) return 1;
      if (b.daysUntilStockout === null) return -1;
      return a.daysUntilStockout - b.daysUntilStockout;
    });
  }

  // Price suggestion based on target margin — a pricing heuristic (cost /
  // (1 - margin)), not market elasticity or competition. Only includes
  // products with a registered cost (without a cost there's no way to
  // calculate margin).
  async pricingSuggestions(tenantId: string, query: PricingSuggestionQuery): Promise<PricingSuggestionItem[]> {
    const targetMarginPercent = query.targetMarginPercent ?? 30;

    const rows = await runWithTenant(this.db, tenantId, (tx) =>
      tx
        .select({ id: products.id, name: products.name, priceCents: products.priceCents, costPriceCents: products.costPriceCents })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.active, true), isNotNull(products.costPriceCents))),
    );
    const withCost = rows.filter((row): row is typeof row & { costPriceCents: number } => row.costPriceCents !== null);

    const results = withCost.map((product) => {
      const currentMarginPercent =
        product.priceCents > 0 ? ((product.priceCents - product.costPriceCents) / product.priceCents) * 100 : product.costPriceCents > 0 ? -100 : 0;
      return {
        productId: product.id,
        productName: product.name,
        priceCents: product.priceCents,
        costPriceCents: product.costPriceCents,
        currentMarginPercent: Math.round(currentMarginPercent * 10) / 10,
        suggestedPriceCents: Math.round(product.costPriceCents / (1 - targetMarginPercent / 100)),
        belowCost: product.priceCents <= product.costPriceCents,
      };
    });

    return results.sort((a, b) => a.currentMarginPercent - b.currentMarginPercent);
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

  // A sale with a partial return keeps status='completed' (only a full
  // return becomes 'canceled', already excluded by completedSalesInRange)
  // — without this, all revenue/ranking/commission figures would keep
  // counting the sale's full amount even after part of it was actually
  // refunded to the customer.
  private async refundedCentsBySale(tenantId: string, saleIds: string[]): Promise<Map<string, number>> {
    if (saleIds.length === 0) {
      return new Map();
    }
    const rows = await runWithTenant(this.db, tenantId, (tx) =>
      tx
        .select({ saleId: saleReturns.saleId, totalRefundedCents: saleReturns.totalRefundedCents })
        .from(saleReturns)
        .where(and(eq(saleReturns.tenantId, tenantId), inArray(saleReturns.saleId, saleIds))),
    );
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.saleId, (map.get(row.saleId) ?? 0) + row.totalRefundedCents);
    }
    return map;
  }

  // Same reasoning as refundedCentsBySale, at line-item granularity — used
  // by product ranking and reorder suggestions, which aggregate by
  // saleItemId/productId instead of by whole sale.
  private async returnedByLineItem(
    tenantId: string,
    saleItemIds: string[],
  ): Promise<Map<string, { quantity: number; refundedCents: number }>> {
    if (saleItemIds.length === 0) {
      return new Map();
    }
    const rows = await runWithTenant(this.db, tenantId, (tx) =>
      tx
        .select({ saleItemId: saleReturnItems.saleItemId, quantity: saleReturnItems.quantity, refundedCents: saleReturnItems.refundedCents })
        .from(saleReturnItems)
        .where(
          and(
            eq(saleReturnItems.tenantId, tenantId),
            eq(saleReturnItems.applied, true),
            inArray(saleReturnItems.saleItemId, saleItemIds),
          ),
        ),
    );
    const map = new Map<string, { quantity: number; refundedCents: number }>();
    for (const row of rows) {
      const acc = map.get(row.saleItemId) ?? { quantity: 0, refundedCents: 0 };
      acc.quantity += row.quantity;
      acc.refundedCents += row.refundedCents;
      map.set(row.saleItemId, acc);
    }
    return map;
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
    const returnedByItem = await this.returnedByLineItem(
      tenantId,
      items.map((item) => item.id),
    );

    const byProduct = new Map<string, { productName: string; quantitySold: number; revenueCents: number }>();
    for (const item of items) {
      const returned = returnedByItem.get(item.id);
      const acc = byProduct.get(item.productId) ?? { productName: item.productName, quantitySold: 0, revenueCents: 0 };
      acc.quantitySold += item.quantity - (returned?.quantity ?? 0);
      acc.revenueCents += item.totalCents - (returned?.refundedCents ?? 0);
      byProduct.set(item.productId, acc);
    }

    return [...byProduct.entries()]
      .map(([productId, acc]) => ({ productId, ...acc }))
      .sort((a, b) => b.revenueCents - a.revenueCents);
  }
}
