import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { CreateStockMovementInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { products, stockMovements, type StockMovementRow } from '../../database/schema/index';

@Injectable()
export class StockService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async createMovement(
    tenantId: string,
    userId: string,
    productId: string,
    input: CreateStockMovementInput,
  ): Promise<StockMovementRow> {
    return runWithTenant(this.db, tenantId, (tx) =>
      this.applyMovement(tx, {
        tenantId,
        userId,
        productId,
        type: input.type,
        delta: input.type === 'saida' ? -input.quantity : input.quantity,
        reason: input.reason ?? null,
        saleId: null,
      }),
    );
  }

  // Used by SalesService inside the sale's own transaction, so the stock
  // deduction and the sale are atomic (both happen, or neither does).
  async applyMovement(
    tx: Database,
    params: {
      tenantId: string;
      userId: string;
      productId: string;
      type: 'entrada' | 'saida' | 'ajuste';
      delta: number;
      reason: string | null;
      saleId: string | null;
    },
  ): Promise<StockMovementRow> {
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, params.productId), eq(products.tenantId, params.tenantId)))
      .limit(1);
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    const newBalance = product.stockQuantity + params.delta;
    if (newBalance < 0) {
      throw new BadRequestException(
        `Estoque insuficiente para "${product.name}": saldo atual é ${product.stockQuantity}`,
      );
    }

    await tx
      .update(products)
      .set({ stockQuantity: newBalance })
      .where(and(eq(products.id, params.productId), eq(products.tenantId, params.tenantId)));

    const [movement] = await tx
      .insert(stockMovements)
      .values({
        tenantId: params.tenantId,
        productId: params.productId,
        type: params.type,
        quantity: params.delta,
        reason: params.reason,
        saleId: params.saleId,
        createdBy: params.userId,
      })
      .returning();
    if (!movement) {
      throw new Error('Falha ao registrar movimentação de estoque');
    }
    return movement;
  }

  async listMovements(tenantId: string, productId: string): Promise<StockMovementRow[]> {
    const [product] = await runWithTenant(this.db, tenantId, (tx) =>
      tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
        .limit(1),
    );
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }
    return runWithTenant(this.db, tenantId, (tx) =>
      tx
        .select()
        .from(stockMovements)
        .where(and(eq(stockMovements.productId, productId), eq(stockMovements.tenantId, tenantId)))
        .orderBy(desc(stockMovements.createdAt)),
    );
  }
}
