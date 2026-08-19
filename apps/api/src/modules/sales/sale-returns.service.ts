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
  ) {}

  async create(tenantId: string, userId: string, saleId: string, input: CreateSaleReturnInput): Promise<SaleReturnWithItems> {
    // Mesma exigência da venda: reembolso em dinheiro precisa de um caixa
    // aberto do operador que está processando a devolução — não necessariamente
    // a mesma sessão da venda original, que já pode ter fechado.
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

      // Agrega por saleItemId ANTES de validar: duas linhas pedindo o mesmo
      // item na mesma requisição precisam ser validadas contra a SOMA das
      // duas, não cada uma isoladamente contra o saldo já devolvido (senão
      // {item X qty 5}+{item X qty 5} numa venda que só vendeu 5 passava nas
      // duas checagens independentes e devolvia/reembolsava o dobro do que
      // foi vendido, numa única requisição, sem nenhuma corrida envolvida).
      const requestedByItem = new Map<string, number>();
      for (const requested of input.items) {
        requestedByItem.set(requested.saleItemId, (requestedByItem.get(requested.saleItemId) ?? 0) + requested.quantity);
      }

      // Tudo-ou-nada: qualquer linha pedida inválida derruba a devolução
      // inteira antes de gravar qualquer coisa — nunca fica parcialmente
      // aplicada, nunca falha silenciosamente numa linha só.
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

      // Rateio: se a venda teve desconto ou resgate de pontos de fidelidade,
      // devolve proporcionalmente ao que o cliente pagou de fato, não o preço
      // de tabela da linha — evita devolver mais dinheiro do que foi recebido.
      const ratio = sale.subtotalCents > 0 ? sale.totalCents / sale.subtotalCents : 1;

      const lines = Array.from(requestedByItem.entries()).map(([saleItemId, quantity]) => {
        const saleItem = itemById.get(saleItemId)!;
        const refundedCents = Math.round(saleItem.unitPriceCents * quantity * ratio);
        return { saleItem, quantity, refundedCents };
      });
      const totalRefundedCents = lines.reduce((sum, line) => sum + line.refundedCents, 0);

      const issues: string[] = [];

      // Estoque: sempre restaurado para itens com controle de estoque, mesmo
      // se o produto foi desativado depois — mesma transação da devolução.
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

      // Fidelidade: se a venda original usou resgate de pontos, a reversão
      // automática fica de fora do v1 (regra ambígua — devolver os pontos E
      // o dinheiro é decisão de negócio, não técnica) e a devolução é
      // sinalizada pra ajuste manual. Sem resgate, pontos ganhos são
      // estornados proporcionalmente ao valor devolvido.
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

      // Reembolso: dinheiro sai do caixa de quem processa agora; cartão/Pix
      // chama o provedor e, se recusado, derruba a transação inteira (nada
      // fica "meio estornado"); outro método só é registrado, sem efeito
      // colateral automático (ex.: crédito de loja resolvido manualmente).
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
        // Venda com pagamento dividido pode ter mais de um pagamento não-dinheiro
        // (ex.: metade cartão, metade Pix) — escolhe o de maior valor (mais chance
        // de cobrir o reembolso) em vez do primeiro que aparecer, e exige que ele
        // sozinho cubra o total: mandar mais do que aquela transação específica
        // cobrou pra um gateway real seria recusado (ou pior, debitaria o
        // lojista); melhor um erro claro aqui do que estornar contra a
        // transação errada ou por um valor que ela nunca cobrou.
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

      // Fiscal: cancelamento de NFC-e só é tentado quando 100% da venda
      // (somando todas as devoluções, inclusive esta) já foi devolvida — nota
      // complementar de devolução parcial é um fluxo fiscal diferente, fora
      // de escopo do v1.
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
