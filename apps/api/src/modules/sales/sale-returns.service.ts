import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { CreateSaleReturnInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import {
  sales,
  saleItems,
  salePayments,
  saleReturns,
  saleReturnItems,
  loyaltyLedgerEntries,
  products,
  type SaleItemRow,
  type SaleReturnRow,
  type SaleReturnItemRow,
} from '../../database/schema/index';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CashSessionsService } from '../cash-sessions/cash-sessions.service';
import { StockService } from '../stock/stock.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../payments/payment-provider.interface';
import { FiscalService } from '../fiscal/fiscal.service';

export interface SaleReturnWithItems extends SaleReturnRow {
  items: SaleReturnItemRow[];
}

@Injectable()
export class SaleReturnsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly cashSessionsService: CashSessionsService,
    private readonly stockService: StockService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    private readonly fiscalService: FiscalService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(tenantId: string, userId: string, saleId: string, input: CreateSaleReturnInput): Promise<SaleReturnWithItems> {
    // Same requirement as the sale: a cash refund needs an open cash session
    // for the operator processing the return — not necessarily the same
    // session as the original sale, which may have already closed.
    const cashSession =
      input.refundMethod === 'dinheiro' ? await this.cashSessionsService.getCurrentOpenSession(tenantId, userId) : undefined;
    if (input.refundMethod === 'dinheiro' && !cashSession) {
      throw new BadRequestException('Abra o caixa antes de processar uma devolução em dinheiro');
    }

    return runWithTenant(this.db, tenantId, async (tx) => {
      const [sale] = await tx.select().from(sales).where(and(eq(sales.id, saleId), eq(sales.tenantId, tenantId))).limit(1);
      if (!sale) {
        throw new NotFoundException('Venda não encontrada');
      }

      const allItems = await tx.select().from(saleItems).where(eq(saleItems.saleId, sale.id));
      const itemById = new Map<string, SaleItemRow>(allItems.map((item) => [item.id, item]));

      const previousReturnItems = await tx
        .select()
        .from(saleReturnItems)
        .where(
          inArray(
            saleReturnItems.saleItemId,
            allItems.map((item) => item.id),
          ),
        );
      const alreadyReturnedByItem = new Map<string, number>();
      for (const row of previousReturnItems) {
        alreadyReturnedByItem.set(row.saleItemId, (alreadyReturnedByItem.get(row.saleItemId) ?? 0) + row.quantity);
      }

      // Aggregate by saleItemId BEFORE validating: two lines requesting the
      // same item in the same request must be validated against their
      // COMBINED total, not each checked independently against the balance
      // already returned (otherwise {item X qty 5}+{item X qty 5} on a sale
      // that only sold 5 would pass both independent checks and
      // return/refund double what was actually sold, in a single request,
      // with no race condition involved).
      const requestedByItem = new Map<string, number>();
      for (const requested of input.items) {
        requestedByItem.set(requested.saleItemId, (requestedByItem.get(requested.saleItemId) ?? 0) + requested.quantity);
      }

      // All-or-nothing: any invalid requested line takes down the entire
      // return before anything is written — it never ends up partially
      // applied, and never fails silently on just one line.
      for (const [saleItemId, requestedQuantity] of requestedByItem) {
        const saleItem = itemById.get(saleItemId);
        if (!saleItem) {
          throw new BadRequestException(`Item ${saleItemId} não pertence a esta venda`);
        }
        const alreadyReturned = alreadyReturnedByItem.get(saleItemId) ?? 0;
        if (alreadyReturned + requestedQuantity > saleItem.quantity) {
          const remaining = saleItem.quantity - alreadyReturned;
          throw new BadRequestException(
            `Quantidade pedida para "${saleItem.productName}" excede o saldo devolvível (restam ${remaining} de ${saleItem.quantity})`,
          );
        }
      }

      // Proration: if the sale had a discount or a loyalty points
      // redemption, the refund is proportional to what the customer
      // actually paid, not the line's list price — this avoids refunding
      // more money than was received.
      const ratio = sale.subtotalCents > 0 ? sale.totalCents / sale.subtotalCents : 1;

      const lines = Array.from(requestedByItem.entries()).map(([saleItemId, quantity]) => {
        const saleItem = itemById.get(saleItemId)!;
        const refundedCents = Math.round(saleItem.unitPriceCents * quantity * ratio);
        return { saleItem, quantity, refundedCents };
      });
      const totalRefundedCents = lines.reduce((sum, line) => sum + line.refundedCents, 0);

      const issues: string[] = [];

      // Stock: always restored for stock-tracked items, even if the product
      // was deactivated afterward — same transaction as the return.
      const productRows = await tx
        .select()
        .from(products)
        .where(
          inArray(
            products.id,
            lines.map((line) => line.saleItem.productId),
          ),
        );
      const productById = new Map(productRows.map((p) => [p.id, p]));
      for (const line of lines) {
        const product = productById.get(line.saleItem.productId);
        if (product?.trackStock) {
          await this.stockService.applyMovement(tx, {
            tenantId,
            userId,
            productId: product.id,
            type: 'entrada',
            delta: line.quantity,
            reason: `Devolução da venda #${sale.id}`,
            saleId: sale.id,
          });
        }
      }

      // Loyalty: if the original sale used a points redemption, automatic
      // reversal is out of scope for v1 (an ambiguous rule — refunding both
      // the points AND the money is a business decision, not a technical
      // one), and the return is flagged for manual adjustment. Without a
      // redemption, points earned are clawed back proportionally to the
      // amount refunded.
      if (sale.customerId) {
        const loyaltyEntries = await tx
          .select()
          .from(loyaltyLedgerEntries)
          .where(eq(loyaltyLedgerEntries.saleId, sale.id));
        const redeemEntry = loyaltyEntries.find((e) => e.type === 'redeem');
        const earnEntry = loyaltyEntries.find((e) => e.type === 'earn');
        if (redeemEntry) {
          issues.push('Venda original usou resgate de pontos de fidelidade — reversão de pontos requer ajuste manual');
        } else if (earnEntry && earnEntry.points > 0 && sale.totalCents > 0) {
          const clawback = Math.round(earnEntry.points * (totalRefundedCents / sale.totalCents));
          if (clawback > 0) {
            await tx.insert(loyaltyLedgerEntries).values({
              tenantId,
              customerId: sale.customerId,
              saleId: sale.id,
              type: 'adjustment',
              points: -clawback,
              note: 'Estorno de pontos — devolução da venda',
              createdBy: userId,
            });
          }
        }
      }

      // Refund: cash comes out of the cash session of whoever is processing
      // it now; card/Pix calls the provider and, if declined, takes down
      // the whole transaction (nothing ends up "half refunded"); any other
      // method is just recorded, with no automatic side effect (e.g. store
      // credit resolved manually).
      if (input.refundMethod === 'dinheiro') {
        await this.cashSessionsService.addMovementTx(tx, {
          tenantId,
          userId,
          cashSessionId: cashSession!.id,
          type: 'estorno',
          amountCents: totalRefundedCents,
          reason: `Devolução da venda #${sale.id}`,
        });
      } else if (input.refundMethod === 'estorno_pagamento') {
        const payments = await tx.select().from(salePayments).where(eq(salePayments.saleId, sale.id));
        // A sale with a split payment can have more than one non-cash
        // payment (e.g. half card, half Pix) — picks the one with the
        // highest amount (better chance of covering the refund) rather than
        // the first one found, and requires that it alone cover the total:
        // sending a real gateway more than that specific transaction
        // charged would be declined (or worse, would debit the merchant);
        // better a clear error here than refunding against the wrong
        // transaction or for an amount it never charged.
        const refundablePayment = payments.filter((p) => p.method !== 'dinheiro').sort((a, b) => b.amountCents - a.amountCents)[0];
        if (!refundablePayment) {
          throw new BadRequestException(
            'Esta venda não tem pagamento por cartão ou Pix para estornar — use reembolso em dinheiro ou outro método',
          );
        }
        if (refundablePayment.amountCents < totalRefundedCents) {
          throw new BadRequestException(
            'O valor a devolver excede o que foi cobrado numa única transação de cartão/Pix desta venda — processe como "outro" ou reduza a quantidade devolvida',
          );
        }
        const refund = await this.paymentProvider.refund({
          tenantId,
          saleId: sale.id,
          method: refundablePayment.method as Exclude<typeof refundablePayment.method, 'dinheiro'>,
          amountCents: totalRefundedCents,
          providerTransactionId: refundablePayment.providerTransactionId ?? '',
        });
        if (!refund.approved) {
          throw new BadRequestException(
            `Estorno recusado pela operadora${refund.declineReason ? `: ${refund.declineReason}` : ''}`,
          );
        }
      }

      // Fiscal: NFC-e cancellation is only attempted once 100% of the sale
      // (summing all returns, including this one) has been returned — a
      // partial-return complementary note is a different fiscal flow, out
      // of scope for v1.
      const isFullReturn = allItems.every((item) => {
        const requestedThisRound = lines.find((line) => line.saleItem.id === item.id)?.quantity ?? 0;
        const alreadyReturned = alreadyReturnedByItem.get(item.id) ?? 0;
        return alreadyReturned + requestedThisRound >= item.quantity;
      });

      let fiscalDocumentId: string | null = null;
      if (isFullReturn) {
        const cancelResult = await this.fiscalService.cancelForSale(tx, { tenantId, saleId: sale.id });
        fiscalDocumentId = cancelResult.fiscalDocument?.id ?? null;
        if (!cancelResult.canceled && cancelResult.fiscalDocument?.status === 'authorized') {
          issues.push(`Cancelamento da NFC-e falhou: ${cancelResult.rejectionReason ?? 'motivo desconhecido'}`);
        }
        await tx.update(sales).set({ status: 'canceled' }).where(eq(sales.id, sale.id));
      }

      const [saleReturn] = await tx
        .insert(saleReturns)
        .values({
          tenantId,
          saleId: sale.id,
          processedBy: userId,
          cashSessionId: input.refundMethod === 'dinheiro' ? cashSession!.id : null,
          refundMethod: input.refundMethod,
          reason: input.reason,
          status: issues.length > 0 ? 'needs_attention' : 'completed',
          issue: issues.length > 0 ? issues.join('; ') : null,
          totalRefundedCents,
          fiscalDocumentId,
        })
        .returning();
      if (!saleReturn) {
        throw new Error('Falha ao registrar devolução');
      }

      const insertedItems = await tx
        .insert(saleReturnItems)
        .values(
          lines.map((line) => ({
            tenantId,
            saleReturnId: saleReturn.id,
            saleItemId: line.saleItem.id,
            productId: line.saleItem.productId,
            quantity: line.quantity,
            unitPriceCents: line.saleItem.unitPriceCents,
            refundedCents: line.refundedCents,
            applied: true,
            issue: null,
          })),
        )
        .returning();

      await this.auditLogService.recordTx(tx, {
        tenantId,
        actorUserId: userId,
        action: 'sale_return.created',
        targetType: 'Sale',
        targetId: sale.id,
        metadata: { saleReturnId: saleReturn.id, totalRefundedCents, status: saleReturn.status },
      });

      return { ...saleReturn, items: insertedItems };
    });
  }

  async listForSale(tenantId: string, saleId: string): Promise<SaleReturnWithItems[]> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [sale] = await tx.select({ id: sales.id }).from(sales).where(and(eq(sales.id, saleId), eq(sales.tenantId, tenantId))).limit(1);
      if (!sale) {
        throw new NotFoundException('Venda não encontrada');
      }
      const returns = await tx
        .select()
        .from(saleReturns)
        .where(and(eq(saleReturns.saleId, saleId), eq(saleReturns.tenantId, tenantId)))
        .orderBy(desc(saleReturns.createdAt));
      return this.attachItemsTx(tx, returns);
    });
  }

  async findByIdOrThrow(tenantId: string, id: string): Promise<SaleReturnWithItems> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [saleReturn] = await tx
        .select()
        .from(saleReturns)
        .where(and(eq(saleReturns.id, id), eq(saleReturns.tenantId, tenantId)))
        .limit(1);
      if (!saleReturn) {
        throw new NotFoundException('Devolução não encontrada');
      }
      const [withItems] = await this.attachItemsTx(tx, [saleReturn]);
      return withItems!;
    });
  }

  private async attachItemsTx(tx: Database, returns: SaleReturnRow[]): Promise<SaleReturnWithItems[]> {
    if (returns.length === 0) {
      return [];
    }
    const items = await tx
      .select()
      .from(saleReturnItems)
      .where(
        inArray(
          saleReturnItems.saleReturnId,
          returns.map((r) => r.id),
        ),
      );
    const itemsByReturnId = new Map<string, SaleReturnItemRow[]>();
    for (const item of items) {
      const list = itemsByReturnId.get(item.saleReturnId) ?? [];
      list.push(item);
      itemsByReturnId.set(item.saleReturnId, list);
    }
    return returns.map((r) => ({ ...r, items: itemsByReturnId.get(r.id) ?? [] }));
  }
}
