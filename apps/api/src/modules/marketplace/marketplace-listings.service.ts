import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  marketplaceChannels,
  marketplaceListings,
  products,
  type MarketplaceListingRow,
} from '../../database/schema/index';
import { MARKETPLACE_PROVIDER, type MarketplaceProvider } from './marketplace-provider.interface';

export interface MarketplaceListingWithProductRow extends MarketplaceListingRow {
  productName: string;
  productActive: boolean;
}

@Injectable()
export class MarketplaceListingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(MARKETPLACE_PROVIDER) private readonly provider: MarketplaceProvider,
  ) {}

  async listForChannel(tenantId: string, channelId: string): Promise<MarketplaceListingWithProductRow[]> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [channel] = await tx
        .select({ id: marketplaceChannels.id })
        .from(marketplaceChannels)
        .where(and(eq(marketplaceChannels.id, channelId), eq(marketplaceChannels.tenantId, tenantId)))
        .limit(1);
      if (!channel) {
        throw new NotFoundException('Integração não encontrada');
      }
      const rows = await tx
        .select({
          id: marketplaceListings.id,
          tenantId: marketplaceListings.tenantId,
          channelId: marketplaceListings.channelId,
          productId: marketplaceListings.productId,
          externalProductId: marketplaceListings.externalProductId,
          status: marketplaceListings.status,
          lastSyncedAt: marketplaceListings.lastSyncedAt,
          lastSyncError: marketplaceListings.lastSyncError,
          createdAt: marketplaceListings.createdAt,
          updatedAt: marketplaceListings.updatedAt,
          productName: products.name,
          productActive: products.active,
        })
        .from(marketplaceListings)
        .innerJoin(products, eq(products.id, marketplaceListings.productId))
        .where(and(eq(marketplaceListings.channelId, channelId), eq(marketplaceListings.tenantId, tenantId)));
      return rows;
    });
  }

  // Idempotente: chamar de novo pra um produto já sincronizado apenas
  // atualiza a listagem existente (upsert por channelId+productId), não
  // duplica. Falha do provider não derruba a request — fica registrada como
  // status 'error' pra tentar de novo depois, mesmo racional de contingência
  // do FiscalService.
  async syncProduct(tenantId: string, channelId: string, productId: string): Promise<MarketplaceListingRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const channel = await this.assertChannelExists(tx, tenantId, channelId);
      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
        .limit(1);
      if (!product) {
        throw new NotFoundException('Produto não encontrado');
      }

      const [existing] = await tx
        .select()
        .from(marketplaceListings)
        .where(and(eq(marketplaceListings.channelId, channelId), eq(marketplaceListings.productId, productId)))
        .limit(1);

      try {
        const result = await this.provider.syncProduct({
          externalStoreId: channel.externalStoreId,
          productName: product.name,
          sku: product.sku,
          priceCents: product.priceCents,
          stockQuantity: product.stockQuantity,
        });

        const values = {
          externalProductId: result.externalProductId,
          status: 'synced' as const,
          lastSyncedAt: new Date(),
          lastSyncError: null,
          updatedAt: new Date(),
        };

        if (existing) {
          const [updated] = await tx
            .update(marketplaceListings)
            .set(values)
            .where(eq(marketplaceListings.id, existing.id))
            .returning();
          return updated!;
        }
        const [inserted] = await tx
          .insert(marketplaceListings)
          .values({ tenantId, channelId, productId, ...values })
          .returning();
        return inserted!;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha de comunicação com o canal';
        if (existing) {
          const [updated] = await tx
            .update(marketplaceListings)
            .set({ status: 'error', lastSyncError: message, updatedAt: new Date() })
            .where(eq(marketplaceListings.id, existing.id))
            .returning();
          return updated!;
        }
        const [inserted] = await tx
          .insert(marketplaceListings)
          .values({ tenantId, channelId, productId, status: 'error', lastSyncError: message })
          .returning();
        return inserted!;
      }
    });
  }

  private async assertChannelExists(tx: Database, tenantId: string, channelId: string) {
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
    return channel;
  }
}
