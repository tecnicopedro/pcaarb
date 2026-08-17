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
  fiscalDocuments,
  loyaltyLedgerEntries,
  type ProductRow,
  type SaleRow,
  type SaleItemRow,
  type SalePaymentRow,
  type FiscalDocumentRow,
} from '../../database/schema/index';
import { CashSessionsService } from '../cash-sessions/cash-sessions.service';
import { StockService } from '../stock/stock.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../payments/payment-provider.interface';
import { FiscalService } from '../fiscal/fiscal.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { calculateSaleTotals, sumPaymentsCents } from './sale-calculations';

export interface SaleWithDetails extends SaleRow {
  items: SaleItemRow[];
  payments: SalePaymentRow[];
  fiscalDocument: FiscalDocumentRow | null;
  pointsRedeemed: number;
  pointsEarned: number;
}

@Injectable()
export class SalesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly cashSessionsService: CashSessionsService,
    private readonly stockService: StockService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    private readonly fiscalService: FiscalService,
    private readonly loyaltyService: LoyaltyService,
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

      const pointsToRedeem = input.pointsToRedeem ?? 0;
      if (pointsToRedeem > 0 && !input.customerId) {
        throw new BadRequestException('Resgate de pontos de fidelidade exige um cliente selecionado na venda');
      }
      const loyaltyProgram = await this.loyaltyService.getOrCreateProgramTx(tx, tenantId);
      if (pointsToRedeem > 0 && !loyaltyProgram.active) {
        throw new BadRequestException('Programa de fidelidade está desativado');
      }
      const redemptionValueCents = pointsToRedeem * loyaltyProgram.redeemValueCents;

      const { subtotalCents, totalCents } = calculateSaleTotals(lines, input.discountCents ?? 0, redemptionValueCents);
      if (totalCents < 0) {
        throw new BadRequestException('Desconto e resgate de pontos não podem ser maiores que o subtotal da venda');
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

      if (pointsToRedeem > 0) {
        // Validação de saldo acontece aqui (não antes): dentro da mesma
        // transação da venda, então um saldo insuficiente derruba a venda
        // inteira junto (nada de venda registrada com resgate parcial).
        await this.loyaltyService.redeemTx(tx, {
          tenantId,
          customerId: input.customerId!,
          saleId: sale.id,
          points: pointsToRedeem,
        });
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

      const paymentsWithTransaction = await Promise.all(
        input.payments.map(async (payment) => {
          if (payment.method === 'dinheiro') {
            return { ...payment, providerTransactionId: null as string | null };
          }
          const charge = await this.paymentProvider.charge({
            tenantId,
            saleId: sale.id,
            method: payment.method,
            amountCents: payment.amountCents,
          });
          if (!charge.approved) {
            throw new BadRequestException(
              `Pagamento em ${payment.method} recusado pela operadora${charge.declineReason ? `: ${charge.declineReason}` : ''}`,
            );
          }
          return { ...payment, providerTransactionId: charge.providerTransactionId };
        }),
      );

      const insertedPayments = await tx
        .insert(salePayments)
        .values(
          paymentsWithTransaction.map((payment) => ({
            tenantId,
            saleId: sale.id,
            method: payment.method,
            amountCents: payment.amountCents,
            providerTransactionId: payment.providerTransactionId,
          })),
        )
        .returning();

      const fiscalDocument = await this.fiscalService.issueForSale(tx, {
        tenantId,
        saleId: sale.id,
        totalCents: sale.totalCents,
        items: insertedItems.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
        })),
      });

      // Ganho é calculado sobre o total líquido (já com desconto e resgate
      // aplicados) e só depois que os pagamentos foram aprovados — cancelar
      // por pagamento recusado não deixa pontos "fantasma" no cliente.
      let pointsEarned = 0;
      if (input.customerId) {
        pointsEarned = await this.loyaltyService.earnTx(tx, {
          tenantId,
          customerId: input.customerId,
          saleId: sale.id,
          netPaidCents: sale.totalCents,
          program: loyaltyProgram,
        });
      }

      return {
        ...sale,
        items: insertedItems,
        payments: insertedPayments,
        fiscalDocument,
        pointsRedeemed: pointsToRedeem,
        pointsEarned,
      };
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
      const [fiscalDocument] = await tx.select().from(fiscalDocuments).where(eq(fiscalDocuments.saleId, sale.id)).limit(1);
      const loyaltyEntries = await tx
        .select({ type: loyaltyLedgerEntries.type, points: loyaltyLedgerEntries.points })
        .from(loyaltyLedgerEntries)
        .where(eq(loyaltyLedgerEntries.saleId, sale.id));
      const pointsRedeemed = -loyaltyEntries.filter((e) => e.type === 'redeem').reduce((sum, e) => sum + e.points, 0);
      const pointsEarned = loyaltyEntries.filter((e) => e.type === 'earn').reduce((sum, e) => sum + e.points, 0);
      return { ...sale, items, payments, fiscalDocument: fiscalDocument ?? null, pointsRedeemed, pointsEarned };
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
