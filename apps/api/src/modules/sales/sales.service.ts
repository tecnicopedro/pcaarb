import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { CreateSaleInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  products,
  sales,
  saleItems,
  salePayments,
  type ProductRow,
  type SaleRow,
  type SaleItemRow,
  type SalePaymentRow,
} from '../../database/schema/index';
import { CashSessionsService } from '../cash-sessions/cash-sessions.service';
import { StockService } from '../stock/stock.service';
import { calculateSaleTotals, sumPaymentsCents } from './sale-calculations';

export interface SaleWithDetails extends SaleRow {
  items: SaleItemRow[];
  payments: SalePaymentRow[];
}

@Injectable()
export class SalesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly cashSessionsService: CashSessionsService,
    private readonly stockService: StockService,
  ) {}

  async create(tenantId: string, sellerId: string, input: CreateSaleInput): Promise<SaleWithDetails> {
    const cashSession = await this.cashSessionsService.getCurrentOpenSession(tenantId, sellerId);
    if (!cashSession) {
      throw new BadRequestException('Abra o caixa antes de registrar uma venda');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      const productIds = input.items.map((item) => item.productId);
      const productRows = await tx
        .select()
        .from(products)
        .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds)));
      const productById = new Map<string, ProductRow>(productRows.map((p) => [p.id, p]));

      for (const item of input.items) {
        const product = productById.get(item.productId);
        if (!product) {
          throw new NotFoundException(`Produto ${item.productId} não encontrado`);
        }
        if (!product.active) {
          throw new BadRequestException(`Produto "${product.name}" está inativo e não pode ser vendido`);
        }
      }

      const lines = input.items.map((item) => {
        const product = productById.get(item.productId)!;
        return { priceCents: product.priceCents, quantity: item.quantity };
      });
      const { subtotalCents, totalCents } = calculateSaleTotals(lines, input.discountCents ?? 0);
      if (totalCents < 0) {
        throw new BadRequestException('Desconto não pode ser maior que o subtotal da venda');
      }

      const paidCents = sumPaymentsCents(input.payments);
      if (paidCents !== totalCents) {
        throw new BadRequestException(
          `Pagamentos somam ${formatCents(paidCents)}, mas o total da venda é ${formatCents(totalCents)}`,
        );
      }

      const [sale] = await tx
        .insert(sales)
        .values({
          tenantId,
          cashSessionId: cashSession.id,
          customerId: input.customerId ?? null,
          sellerId,
          subtotalCents,
          discountCents: input.discountCents ?? 0,
          totalCents,
        })
        .returning();
      if (!sale) {
        throw new Error('Falha ao registrar venda');
      }

      const insertedItems = await tx
        .insert(saleItems)
        .values(
          input.items.map((item) => {
            const product = productById.get(item.productId)!;
            return {
              tenantId,
              saleId: sale.id,
              productId: product.id,
              productName: product.name,
              unitPriceCents: product.priceCents,
              quantity: item.quantity,
              totalCents: product.priceCents * item.quantity,
            };
          }),
        )
        .returning();

      for (const item of input.items) {
        const product = productById.get(item.productId)!;
        if (!product.trackStock) {
          continue;
        }
        await this.stockService.applyMovement(tx, {
          tenantId,
          userId: sellerId,
          productId: product.id,
          type: 'saida',
          delta: -item.quantity,
          reason: null,
          saleId: sale.id,
        });
      }

      const insertedPayments = await tx
        .insert(salePayments)
        .values(
          input.payments.map((payment) => ({
            tenantId,
            saleId: sale.id,
            method: payment.method,
            amountCents: payment.amountCents,
          })),
        )
        .returning();

      return { ...sale, items: insertedItems, payments: insertedPayments };
    });
  }

  async findByIdOrThrow(tenantId: string, id: string): Promise<SaleWithDetails> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [sale] = await tx
        .select()
        .from(sales)
        .where(and(eq(sales.id, id), eq(sales.tenantId, tenantId)))
        .limit(1);
      if (!sale) {
        throw new NotFoundException('Venda não encontrada');
      }
      const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
      const payments = await tx.select().from(salePayments).where(eq(salePayments.saleId, sale.id));
      return { ...sale, items, payments };
    });
  }

  list(tenantId: string): Promise<SaleRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx.select().from(sales).where(eq(sales.tenantId, tenantId)).orderBy(desc(sales.createdAt)),
    );
  }
}

function formatCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}
