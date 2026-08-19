export const MARKETPLACE_PROVIDER = Symbol('MARKETPLACE_PROVIDER');

export interface MarketplaceSyncProductParams {
  externalStoreId: string;
  productName: string;
  sku: string | null;
  priceCents: number;
  stockQuantity: number;
}

export interface MarketplaceSyncProductResult {
  externalProductId: string;
}

export interface MarketplaceOrderItem {
  externalProductId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface MarketplaceIncomingOrder {
  externalOrderId: string;
  totalCents: number;
  items: MarketplaceOrderItem[];
}

/**
 * E-commerce/marketplace channel interface (Shopify, Mercado Livre...) — same
 * pattern as PaymentProvider/FiscalProvider: the rest of the system talks
 * only to this interface, switching channels is writing a new adapter.
 * Covers the two operations that matter for the POS+stock: publishing/
 * updating a product on the channel, and pulling new orders placed there to
 * deduct from shared stock (without this, the same item could be sold
 * twice — once at the counter, once online). Doesn't model the imported
 * order as a POS Sale: a counter sale requires an open cash session (see
 * sales.schema.ts), which doesn't exist for an order placed at 3am on a
 * marketplace. What actually needs to stay consistent between the two
 * channels is the stock balance — see MarketplaceOrdersService.
 */
export interface MarketplaceProvider {
  syncProduct(params: MarketplaceSyncProductParams): Promise<MarketplaceSyncProductResult>;
  fetchNewOrders(externalStoreId: string): Promise<MarketplaceIncomingOrder[]>;
}
