import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { CreateMarketplaceChannelInput, UpdateMarketplaceChannelInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { marketplaceChannels, type MarketplaceChannelRow } from '../../database/schema/index';

@Injectable()
export class MarketplaceChannelsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(tenantId: string): Promise<MarketplaceChannelRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx.select().from(marketplaceChannels).where(eq(marketplaceChannels.tenantId, tenantId)).orderBy(desc(marketplaceChannels.createdAt)),
    );
  }

  // Provider is always 'mock' for now — there's no real Shopify/Mercado
  // Livre handshake to do here (see marketplace-provider.interface.ts).
  // externalStoreId is just a stable placeholder that identifies this
  // connection.
  async create(tenantId: string, input: CreateMarketplaceChannelInput): Promise<MarketplaceChannelRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [channel] = await tx
        .insert(marketplaceChannels)
        .values({ tenantId, provider: 'mock', name: input.name, externalStoreId: `mock_store_${randomUUID()}` })
        .returning();
      if (!channel) {
        throw new Error('Falha ao criar integração');
      }
      return channel;
    });
  }

  async update(tenantId: string, channelId: string, input: UpdateMarketplaceChannelInput): Promise<MarketplaceChannelRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [updated] = await tx
        .update(marketplaceChannels)
        .set({ active: input.active, updatedAt: new Date() })
        .where(and(eq(marketplaceChannels.id, channelId), eq(marketplaceChannels.tenantId, tenantId)))
        .returning();
      if (!updated) {
        throw new NotFoundException('Integração não encontrada');
      }
      return updated;
    });
  }

  async findByIdOrThrow(tenantId: string, channelId: string): Promise<MarketplaceChannelRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [channel] = await tx
        .select()
        .from(marketplaceChannels)
        .where(and(eq(marketplaceChannels.id, channelId), eq(marketplaceChannels.tenantId, tenantId)))
        .limit(1);
      if (!channel) {
        throw new NotFoundException('Integração não encontrada');
      }
      return channel;
    });
  }
}
