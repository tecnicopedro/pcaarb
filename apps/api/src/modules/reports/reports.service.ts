import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import type {
  AbcCurveItem,
  DreSummary,
  ProductRankingItem,
  ReportPeriodQuery,
  SalesSummary,
  SellerRankingItem,
} from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { sales, saleItems, users, financeEntries, costCenters, type SaleRow } from '../../database/schema/index';

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
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

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
