import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  MarketplaceIncomingOrder,
  MarketplaceProvider,
  MarketplaceSyncProductParams,
  MarketplaceSyncProductResult,
} from './marketplace-provider.interface';

/**
 * Adapter de sandbox: sincronizar produto sempre funciona, e não existem
 * pedidos pendentes (sandbox nunca teve um pedido real feito por lá) — fica
 * no lugar do adapter real (Shopify/Mercado Livre) até termos conta e
 * credenciais com um parceiro, mesmo racional do MockPaymentProvider/
 * MockFiscalProvider. A lógica de importar pedido (idempotência, produto não
 * mapeado, estoque insuficiente) é real e testada via um provider de teste
 * que devolve pedidos fabricados — ver marketplace.e2e-spec.ts.
 */
@Injectable()
export class MockMarketplaceProvider implements MarketplaceProvider {
  async syncProduct(_params: MarketplaceSyncProductParams): Promise<MarketplaceSyncProductResult> {
    return { externalProductId: `mock_prod_${randomUUID()}` };
  }

  async fetchNewOrders(_externalStoreId: string): Promise<MarketplaceIncomingOrder[]> {
    return [];
  }
}
