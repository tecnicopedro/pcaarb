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
 * Interface do canal de e-commerce/marketplace (Shopify, Mercado Livre...) —
 * mesmo padrão de PaymentProvider/FiscalProvider: o resto do sistema fala só
 * com esta interface, trocar de canal é escrever um novo adapter. Cobre as
 * duas operações que importam pro PDV+estoque: publicar/atualizar um produto
 * no canal, e puxar pedidos novos feitos por lá pra abater do estoque
 * compartilhado (sem isso, o mesmo item podia ser vendido duas vezes — uma
 * no balcão, outra online). Não modela o pedido importado como uma Sale de
 * PDV: uma venda de balcão exige caixa aberto (ver sales.schema.ts), o que
 * não existe pra um pedido feito de madrugada num marketplace. O que
 * realmente precisa ficar consistente entre os dois canais é o saldo de
 * estoque — ver MarketplaceOrdersService.
 */
export interface MarketplaceProvider {
  syncProduct(params: MarketplaceSyncProductParams): Promise<MarketplaceSyncProductResult>;
  fetchNewOrders(externalStoreId: string): Promise<MarketplaceIncomingOrder[]>;
}
