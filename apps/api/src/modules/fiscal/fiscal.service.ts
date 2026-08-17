import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { fiscalDocuments, sales, saleItems, type FiscalDocumentRow } from '../../database/schema/index';
import { FISCAL_PROVIDER, type FiscalIssueParams, type FiscalIssueResult, type FiscalProvider } from './fiscal-provider.interface';

@Injectable()
export class FiscalService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(FISCAL_PROVIDER) private readonly provider: FiscalProvider,
  ) {}

  async issueForSale(tx: Database, params: FiscalIssueParams): Promise<FiscalDocumentRow> {
    const result = await this.callProvider(params);
    const [doc] = await tx
      .insert(fiscalDocuments)
      .values({
        tenantId: params.tenantId,
        saleId: params.saleId,
        status: result.authorized ? 'authorized' : 'rejected',
        accessKey: result.accessKey ?? null,
        documentUrl: result.documentUrl ?? null,
        rejectionReason: result.rejectionReason ?? null,
        issuedAt: result.authorized ? new Date() : null,
      })
      .returning();
    if (!doc) {
      throw new Error('Falha ao registrar documento fiscal');
    }
    return doc;
  }

  async retry(tenantId: string, saleId: string): Promise<FiscalDocumentRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(fiscalDocuments)
        .where(and(eq(fiscalDocuments.saleId, saleId), eq(fiscalDocuments.tenantId, tenantId)))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Documento fiscal não encontrado para esta venda');
      }
      if (existing.status === 'authorized') {
        throw new ConflictException('Documento fiscal já autorizado — não é possível reemitir');
      }

      const [sale] = await tx
        .select()
        .from(sales)
        .where(and(eq(sales.id, saleId), eq(sales.tenantId, tenantId)))
        .limit(1);
      if (!sale) {
        throw new NotFoundException('Venda não encontrada');
      }
      const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, saleId));

      const result = await this.callProvider({
        tenantId,
        saleId,
        totalCents: sale.totalCents,
        items: items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
        })),
      });

      const [updated] = await tx
        .update(fiscalDocuments)
        .set({
          status: result.authorized ? 'authorized' : 'rejected',
          accessKey: result.accessKey ?? null,
          documentUrl: result.documentUrl ?? null,
          rejectionReason: result.rejectionReason ?? null,
          issuedAt: result.authorized ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(fiscalDocuments.id, existing.id))
        .returning();
      if (!updated) {
        throw new Error('Falha ao atualizar documento fiscal');
      }
      return updated;
    });
  }

  private async callProvider(params: FiscalIssueParams): Promise<FiscalIssueResult> {
    try {
      return await this.provider.issueNFCe(params);
    } catch {
      // Contingência: SEFAZ/provedor fora do ar não pode travar a venda —
      // fica pendente/rejeitado para reemissão manual depois.
      return {
        authorized: false,
        rejectionReason: 'Falha de comunicação com o provedor fiscal — tente reemitir novamente em instantes',
      };
    }
  }
}
