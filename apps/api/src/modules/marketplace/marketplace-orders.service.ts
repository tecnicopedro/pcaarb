import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  marketplaceChannels,
  marketplaceListings,
  marketplaceOrders,
  marketplaceOrderItems,
  products,
  type MarketplaceOrderRow,
  type NewMarketplaceOrderItemRow,
  type ProductRow,
} from '../../database/schema/index';
import { StockService } from '../stock/stock.service';
import { MARKETPLACE_PROVIDER, type MarketplaceProvider, type MarketplaceIncomingOrder } from './marketplace-provider.interface';

export interface PullOrdersResult {
  fetched: number;
  imported: number;
  needsAttention: number;
  alreadyProcessed: number;
  orders: MarketplaceOrderRow[];
}

@Injectable()
export class MarketplaceOrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(MARKETPLACE_PROVIDER) private readonly provider: MarketplaceProvider,
    private readonly stockService: StockService,
  ) {}

  async listForChannel(tenantId: string, channelId: string): Promise<MarketplaceOrderRow[]> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [channel] = await tx
        .select({ id: marketplaceChannels.id })
        .from(marketplaceChannels)
        .where(and(eq(marketplaceChannels.id, channelId), eq(marketplaceChannels.tenantId, tenantId)))
        .limit(1);
      if (!channel) {
        throw new NotFoundException('Integração não encontrada');
      }
      return tx
        .select()
        .from(marketplaceOrders)
        .where(and(eq(marketplaceOrders.channelId, channelId), eq(marketplaceOrders.tenantId, tenantId)))
        .orderBy(desc(marketplaceOrders.createdAt));
    });
  }

  /**
   * Pulls new orders from the channel and tries to apply them to shared stock.
   *
   * Two deliberate correctness guarantees (same care as the offline PDV —
   * see pcaarb_mobile_pdv_decision):
   * 1. Idempotency: (channelId, externalOrderId) is unique. An order that
   *    already showed up in a previous sync is silently ignored the second
   *    time (counted in `alreadyProcessed`) — reprocessing the whole list
   *    after a partial failure never deducts stock twice.
   * 2. All-or-nothing per order: if any item in the order doesn't resolve to
   *    a synced, active product with enough stock, the entire order becomes
   *    'needs_attention' with the reason recorded — none of its items are
   *    applied. It never applies part of an order or invents a silent
   *    correction; it stays visible for the operator to resolve manually.
   */
  async pullOrders(tenantId: string, userId: string, channelId: string): Promise<PullOrdersResult> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [channel] = await tx
        .select()
        .from(marketplaceChannels)
        .where(and(eq(marketplaceChannels.id, channelId), eq(marketplaceChannels.tenantId, tenantId)))
        .limit(1);
      if (!channel) {
        throw new NotFoundException('Integração não encontrada');
      }
      if (!channel.active) {
        throw new BadRequestException('Integração está inativa');
      }

      const incomingOrders = await this.provider.fetchNewOrders(channel.externalStoreId);

      const resultOrders: MarketplaceOrderRow[] = [];
      let imported = 0;
      let needsAttention = 0;
      let alreadyProcessed = 0;

      for (const incoming of incomingOrders) {
        const [orderRow] = await tx
          .insert(marketplaceOrders)
          .values({
            tenantId,
            channelId,
            externalOrderId: incoming.externalOrderId,
            totalCents: incoming.totalCents,
            status: 'needs_attention',
          })
          .onConflictDoNothing({ target: [marketplaceOrders.channelId, marketplaceOrders.externalOrderId] })
          .returning();
        if (!orderRow) {
          // A record for this externalOrderId already exists — a previous
          // sync (or this same fetchNewOrders call returning the order
          // again) already handled it. Doesn't reopen or reapply it.
          alreadyProcessed += 1;
          continue;
        }

        const outcome = await this.applyOrder(tx, { tenantId, userId, channel, orderId: orderRow.id, incoming });
        resultOrders.push(outcome.order);
        if (outcome.order.status === 'imported') {
          imported += 1;
        } else {
          needsAttention += 1;
        }
      }

      return {
        fetched: incomingOrders.length,
        imported,
        needsAttention,
        alreadyProcessed,
        orders: resultOrders,
      };
    });
  }

  private async applyOrder(
    tx: Database,
    params: {
      tenantId: string;
      userId: string;
      channel: { id: string; name: string };
      orderId: string;
      incoming: MarketplaceIncomingOrder;
    },
  ): Promise<{ order: MarketplaceOrderRow }> {
    const { tenantId, userId, channel, orderId, incoming } = params;
    const issues: string[] = [];
    const itemRecords: NewMarketplaceOrderItemRow[] = [];
    const aggregatedByProduct = new Map<string, { product: ProductRow; quantity: number }>();

    for (const item of incoming.items) {
      const [listing] = await tx
        .select()
        .from(marketplaceListings)
        .where(
          and(eq(marketplaceListings.channelId, channel.id), eq(marketplaceListings.externalProductId, item.externalProductId)),
        )
        .limit(1);
      if (!listing) {
        issues.push(`Produto externo "${item.externalProductId}" não está sincronizado com nenhum produto local`);
        itemRecords.push({
          tenantId,
          orderId,
          externalProductId: item.externalProductId,
          productId: null,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          applied: false,
          issue: 'produto não mapeado',
        });
        continue;
      }

      const [product] = await tx.select().from(products).where(eq(products.id, listing.productId)).limit(1);
      if (!product || !product.active) {
        issues.push(`Produto "${product?.name ?? listing.productId}" está inativo ou não existe mais`);
        itemRecords.push({
          tenantId,
          orderId,
          externalProductId: item.externalProductId,
          productId: listing.productId,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          applied: false,
          issue: 'produto inativo',
        });
        continue;
      }

      itemRecords.push({
        tenantId,
        orderId,
        externalProductId: item.externalProductId,
        productId: product.id,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        applied: false, // re-evaluated below after the aggregated stock check
        issue: null,
      });
      const agg = aggregatedByProduct.get(product.id) ?? { product, quantity: 0 };
      agg.quantity += item.quantity;
      aggregatedByProduct.set(product.id, agg);
    }

    if (issues.length === 0) {
      for (const { product, quantity } of aggregatedByProduct.values()) {
        if (product.trackStock && product.stockQuantity < quantity) {
          issues.push(
            `Estoque insuficiente para "${product.name}": disponível ${product.stockQuantity}, pedido ${quantity}`,
          );
        }
      }
    }

    if (issues.length > 0) {
      const [order] = await tx
        .update(marketplaceOrders)
        .set({ status: 'needs_attention', issue: issues.join('; ') })
        .where(eq(marketplaceOrders.id, orderId))
        .returning();
      await tx.insert(marketplaceOrderItems).values(itemRecords);
      return { order: order! };
    }

    for (const { product, quantity } of aggregatedByProduct.values()) {
      if (!product.trackStock) {
        continue;
      }
      await this.stockService.applyMovement(tx, {
        tenantId,
        userId,
        productId: product.id,
        type: 'saida',
        delta: -quantity,
        reason: `Venda importada de ${channel.name} (pedido ${incoming.externalOrderId})`,
        saleId: null,
      });
    }
    await tx.insert(marketplaceOrderItems).values(itemRecords.map((item) => ({ ...item, applied: true })));
    const [order] = await tx
      .update(marketplaceOrders)
      .set({ status: 'imported', importedAt: new Date() })
      .where(eq(marketplaceOrders.id, orderId))
      .returning();
    return { order: order! };
  }
}
