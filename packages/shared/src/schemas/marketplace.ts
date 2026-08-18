import { z } from 'zod';

export const marketplaceChannelSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  provider: z.string(),
  name: z.string(),
  externalStoreId: z.string(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type MarketplaceChannel = z.infer<typeof marketplaceChannelSchema>;

export const createMarketplaceChannelSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').max(120),
});

export type CreateMarketplaceChannelInput = z.infer<typeof createMarketplaceChannelSchema>;

export const updateMarketplaceChannelSchema = z.object({
  active: z.boolean(),
});

export type UpdateMarketplaceChannelInput = z.infer<typeof updateMarketplaceChannelSchema>;

export const marketplaceListingStatusSchema = z.enum(['pending', 'synced', 'error']);

export const marketplaceListingSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  channelId: z.string().uuid(),
  productId: z.string().uuid(),
  externalProductId: z.string().nullable(),
  status: marketplaceListingStatusSchema,
  lastSyncedAt: z.string().datetime().nullable(),
  lastSyncError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type MarketplaceListing = z.infer<typeof marketplaceListingSchema>;

// Listagem com dados do produto já resolvidos, pra tela não precisar de um
// segundo fetch — o mesmo padrão usado em outros relatórios/listas do app.
export const marketplaceListingWithProductSchema = marketplaceListingSchema.extend({
  productName: z.string(),
  productActive: z.boolean(),
});

export type MarketplaceListingWithProduct = z.infer<typeof marketplaceListingWithProductSchema>;

export const marketplaceOrderStatusSchema = z.enum(['imported', 'needs_attention']);

export const marketplaceOrderSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  channelId: z.string().uuid(),
  externalOrderId: z.string(),
  totalCents: z.number().int(),
  status: marketplaceOrderStatusSchema,
  issue: z.string().nullable(),
  importedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type MarketplaceOrder = z.infer<typeof marketplaceOrderSchema>;

export const pullMarketplaceOrdersResultSchema = z.object({
  fetched: z.number().int(),
  imported: z.number().int(),
  needsAttention: z.number().int(),
  alreadyProcessed: z.number().int(),
  orders: z.array(marketplaceOrderSchema),
});

export type PullMarketplaceOrdersResult = z.infer<typeof pullMarketplaceOrdersResultSchema>;
