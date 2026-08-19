import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { CreatePurchaseOrderInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  products,
  purchaseOrders,
  purchaseOrderItems,
  suppliers,
  type ProductRow,
  type PurchaseOrderRow,
  type PurchaseOrderItemRow,
} from '../../database/schema/index';
import { StockService } from '../stock/stock.service';

export interface PurchaseOrderWithItems extends PurchaseOrderRow {
  items: PurchaseOrderItemRow[];
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly stockService: StockService,
  ) {}

  async list(tenantId: string): Promise<PurchaseOrderWithItems[]> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const orders = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.tenantId, tenantId))
        .orderBy(desc(purchaseOrders.createdAt));
      if (orders.length === 0) {
        return [];
      }
      const items = await tx
        .select()
        .from(purchaseOrderItems)
        .where(
          and(
            eq(purchaseOrderItems.tenantId, tenantId),
            inArray(
              purchaseOrderItems.purchaseOrderId,
              orders.map((o) => o.id),
            ),
          ),
        );
      const itemsByOrderId = new Map<string, PurchaseOrderItemRow[]>();
      for (const item of items) {
        const list = itemsByOrderId.get(item.purchaseOrderId) ?? [];
        list.push(item);
        itemsByOrderId.set(item.purchaseOrderId, list);
      }
      return orders.map((order) => ({ ...order, items: itemsByOrderId.get(order.id) ?? [] }));
    });
  }

  async findByIdOrThrow(tenantId: string, id: string): Promise<PurchaseOrderWithItems> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
        .limit(1);
      if (!order) {
        throw new NotFoundException('Pedido de compra não encontrado');
      }
      const items = await tx.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, order.id));
      return { ...order, items };
    });
  }

  async create(tenantId: string, userId: string, input: CreatePurchaseOrderInput): Promise<PurchaseOrderWithItems> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.tenantId, tenantId)))
        .limit(1);
      if (!supplier) {
        throw new NotFoundException('Fornecedor não encontrado');
      }

      const productIds = input.items.map((item) => item.productId);
      const productRows = await tx
        .select()
        .from(products)
        .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds)));
      const productById = new Map<string, ProductRow>(productRows.map((p) => [p.id, p]));
      for (const item of input.items) {
        if (!productById.has(item.productId)) {
          throw new NotFoundException(`Produto ${item.productId} não encontrado`);
        }
      }

      const totalCents = input.items.reduce((sum, item) => sum + item.unitCostCents * item.quantity, 0);

      const [order] = await tx
        .insert(purchaseOrders)
        .values({
          tenantId,
          supplierId: input.supplierId,
          notes: input.notes ?? null,
          totalCents,
          createdBy: userId,
        })
        .returning();
      if (!order) {
        throw new Error('Falha ao criar pedido de compra');
      }

      const insertedItems = await tx
        .insert(purchaseOrderItems)
        .values(
          input.items.map((item) => {
            const product = productById.get(item.productId)!;
            return {
              tenantId,
              purchaseOrderId: order.id,
              productId: product.id,
              productName: product.name,
              unitCostCents: item.unitCostCents,
              quantity: item.quantity,
              totalCents: item.unitCostCents * item.quantity,
            };
          }),
        )
        .returning();

      return { ...order, items: insertedItems };
    });
  }

  async receive(tenantId: string, userId: string, id: string): Promise<PurchaseOrderWithItems> {
    const existing = await this.findByIdOrThrow(tenantId, id);
    if (existing.status !== 'draft') {
      throw new ConflictException('Só é possível receber pedidos em rascunho');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      for (const item of existing.items) {
        const [product] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)))
          .limit(1);
        if (!product) {
          continue;
        }

        if (product.trackStock) {
          await this.stockService.applyMovement(tx, {
            tenantId,
            userId,
            productId: item.productId,
            type: 'entrada',
            delta: item.quantity,
            reason: `Recebimento do pedido de compra ${id}`,
            saleId: null,
          });
        }

        // The latest purchase cost becomes the product's cost — this
        // doesn't block the receipt if it fails (the product may have been
        // removed from the catalog between the order and the receipt), it
        // just skips updating the cost.
        await tx.update(products).set({ costPriceCents: item.unitCostCents }).where(eq(products.id, item.productId));
      }

      const [order] = await tx
        .update(purchaseOrders)
        .set({ status: 'received', receivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
        .returning();
      if (!order) {
        throw new Error('Falha ao confirmar recebimento do pedido de compra');
      }

      return { ...order, items: existing.items };
    });
  }

  async cancel(tenantId: string, id: string): Promise<PurchaseOrderWithItems> {
    const existing = await this.findByIdOrThrow(tenantId, id);
    if (existing.status !== 'draft') {
      throw new ConflictException('Só é possível cancelar pedidos em rascunho');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      const [order] = await tx
        .update(purchaseOrders)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
        .returning();
      if (!order) {
        throw new Error('Falha ao cancelar pedido de compra');
      }
      return { ...order, items: existing.items };
    });
  }
}
