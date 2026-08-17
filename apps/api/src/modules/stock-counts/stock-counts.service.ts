import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { CreateStockCountInput, UpdateStockCountItemInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  products,
  stockCounts,
  stockCountItems,
  type StockCountRow,
  type StockCountItemRow,
} from '../../database/schema/index';
import { StockService } from '../stock/stock.service';

export interface StockCountWithItems extends StockCountRow {
  items: StockCountItemRow[];
}

@Injectable()
export class StockCountsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly stockService: StockService,
  ) {}

  async list(tenantId: string): Promise<StockCountWithItems[]> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const counts = await tx
        .select()
        .from(stockCounts)
        .where(eq(stockCounts.tenantId, tenantId))
        .orderBy(desc(stockCounts.createdAt));
      if (counts.length === 0) {
        return [];
      }
      const items = await tx
        .select()
        .from(stockCountItems)
        .where(
          and(
            eq(stockCountItems.tenantId, tenantId),
            inArray(
              stockCountItems.stockCountId,
              counts.map((count) => count.id),
            ),
          ),
        );
      const itemsByCountId = new Map<string, StockCountItemRow[]>();
      for (const item of items) {
        const list = itemsByCountId.get(item.stockCountId) ?? [];
        list.push(item);
        itemsByCountId.set(item.stockCountId, list);
      }
      return counts.map((count) => ({ ...count, items: itemsByCountId.get(count.id) ?? [] }));
    });
  }

  async findByIdOrThrow(tenantId: string, id: string): Promise<StockCountWithItems> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [count] = await tx
        .select()
        .from(stockCounts)
        .where(and(eq(stockCounts.id, id), eq(stockCounts.tenantId, tenantId)))
        .limit(1);
      if (!count) {
        throw new NotFoundException('Contagem de estoque não encontrada');
      }
      const items = await tx.select().from(stockCountItems).where(eq(stockCountItems.stockCountId, count.id));
      return { ...count, items };
    });
  }

  async create(tenantId: string, userId: string, input: CreateStockCountInput): Promise<StockCountWithItems> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const countedProducts = await tx
        .select()
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.active, true), eq(products.trackStock, true)));

      const [count] = await tx
        .insert(stockCounts)
        .values({ tenantId, notes: input.notes ?? null, createdBy: userId })
        .returning();
      if (!count) {
        throw new Error('Falha ao abrir contagem de estoque');
      }

      const items =
        countedProducts.length > 0
          ? await tx
              .insert(stockCountItems)
              .values(
                countedProducts.map((product) => ({
                  tenantId,
                  stockCountId: count.id,
                  productId: product.id,
                  productName: product.name,
                  expectedQuantity: product.stockQuantity,
                  countedQuantity: null,
                })),
              )
              .returning()
          : [];

      return { ...count, items };
    });
  }

  async setItemCount(
    tenantId: string,
    countId: string,
    itemId: string,
    input: UpdateStockCountItemInput,
  ): Promise<StockCountItemRow> {
    const count = await this.findByIdOrThrow(tenantId, countId);
    if (count.status !== 'open') {
      throw new ConflictException('Só é possível registrar contagem em uma contagem aberta');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      const [item] = await tx
        .update(stockCountItems)
        .set({ countedQuantity: input.countedQuantity })
        .where(
          and(
            eq(stockCountItems.id, itemId),
            eq(stockCountItems.stockCountId, countId),
            eq(stockCountItems.tenantId, tenantId),
          ),
        )
        .returning();
      if (!item) {
        throw new NotFoundException('Item da contagem não encontrado');
      }
      return item;
    });
  }

  async finalize(tenantId: string, userId: string, id: string): Promise<StockCountWithItems> {
    const existing = await this.findByIdOrThrow(tenantId, id);
    if (existing.status !== 'open') {
      throw new ConflictException('Só é possível finalizar uma contagem aberta');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      for (const item of existing.items) {
        if (item.countedQuantity === null) {
          continue;
        }
        const [product] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)))
          .limit(1);
        if (!product) {
          continue;
        }
        // Recalcula contra o saldo atual (não o expectedQuantity, que é só um
        // retrato de quando a contagem abriu) — assim uma venda que aconteça
        // durante a contagem não é silenciosamente desfeita pelo ajuste.
        const delta = item.countedQuantity - product.stockQuantity;
        if (delta === 0) {
          continue;
        }
        await this.stockService.applyMovement(tx, {
          tenantId,
          userId,
          productId: item.productId,
          type: 'ajuste',
          delta,
          reason: `Ajuste por contagem de estoque ${id}`,
          saleId: null,
        });
      }

      const [count] = await tx
        .update(stockCounts)
        .set({ status: 'completed', completedAt: new Date() })
        .where(and(eq(stockCounts.id, id), eq(stockCounts.tenantId, tenantId)))
        .returning();
      if (!count) {
        throw new Error('Falha ao finalizar contagem de estoque');
      }
      return { ...count, items: existing.items };
    });
  }

  async cancel(tenantId: string, id: string): Promise<StockCountWithItems> {
    const existing = await this.findByIdOrThrow(tenantId, id);
    if (existing.status !== 'open') {
      throw new ConflictException('Só é possível cancelar uma contagem aberta');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      const [count] = await tx
        .update(stockCounts)
        .set({ status: 'canceled' })
        .where(and(eq(stockCounts.id, id), eq(stockCounts.tenantId, tenantId)))
        .returning();
      if (!count) {
        throw new Error('Falha ao cancelar contagem de estoque');
      }
      return { ...count, items: existing.items };
    });
  }
}
