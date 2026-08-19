import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  MarketplaceIncomingOrder,
  MarketplaceProvider,
  MarketplaceSyncProductParams,
  MarketplaceSyncProductResult,
} from './marketplace-provider.interface';

/**
 * Sandbox adapter: syncing a product always works, and there are never any
 * pending orders (the sandbox never had a real order placed through it) —
 * stands in for the real adapter (Shopify/Mercado Livre) until we have an
 * account and credentials with a partner, same rationale as
 * MockPaymentProvider/MockFiscalProvider. The order-import logic
 * (idempotency, unmapped product, insufficient stock) is real and tested via
 * a test provider that returns fabricated orders — see
 * marketplace.e2e-spec.ts.
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
