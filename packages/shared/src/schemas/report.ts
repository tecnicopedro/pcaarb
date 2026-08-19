import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD');

export const reportPeriodQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type ReportPeriodQuery = z.infer<typeof reportPeriodQuerySchema>;

export const salesSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  totalSales: z.number(),
  totalRevenueCents: z.number(),
  averageTicketCents: z.number(),
});

export type SalesSummary = z.infer<typeof salesSummarySchema>;

export const productRankingItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  quantitySold: z.number(),
  revenueCents: z.number(),
});

export type ProductRankingItem = z.infer<typeof productRankingItemSchema>;

export const abcCurveItemSchema = productRankingItemSchema.extend({
  revenueSharePercent: z.number(),
  cumulativeSharePercent: z.number(),
  class: z.enum(['A', 'B', 'C']),
});

export type AbcCurveItem = z.infer<typeof abcCurveItemSchema>;

export const sellerRankingItemSchema = z.object({
  sellerId: z.string().uuid(),
  sellerName: z.string(),
  totalSales: z.number(),
  revenueCents: z.number(),
});

export type SellerRankingItem = z.infer<typeof sellerRankingItemSchema>;

export const dreCostCenterBreakdownSchema = z.object({
  costCenterId: z.string().uuid().nullable(),
  costCenterName: z.string(),
  receitasCents: z.number(),
  despesasCents: z.number(),
  resultadoCents: z.number(),
});

export type DreCostCenterBreakdown = z.infer<typeof dreCostCenterBreakdownSchema>;

export const dreSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  receitasCents: z.number(),
  despesasCents: z.number(),
  resultadoCents: z.number(),
  porCentroDeCusto: z.array(dreCostCenterBreakdownSchema),
});

export type DreSummary = z.infer<typeof dreSummarySchema>;

export const sellerCommissionReportItemSchema = z.object({
  sellerId: z.string().uuid(),
  sellerName: z.string(),
  totalSales: z.number(),
  revenueCents: z.number(),
  rateBps: z.number().int(),
  commissionCents: z.number(),
});

export type SellerCommissionReportItem = z.infer<typeof sellerCommissionReportItemSchema>;

export const commissionReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  totalCommissionCents: z.number(),
  porVendedor: z.array(sellerCommissionReportItemSchema),
});

export type CommissionReport = z.infer<typeof commissionReportSchema>;

export const storeRankingItemSchema = z.object({
  storeId: z.string().uuid(),
  storeName: z.string(),
  totalSales: z.number(),
  revenueCents: z.number(),
});

export type StoreRankingItem = z.infer<typeof storeRankingItemSchema>;

// Demand forecast via simple moving average over the given period —
// not a time-series model (no seasonality/trend). Honest for the product's
// current stage: better a clear heuristic than pretending it's "AI".
export const reorderSuggestionQuerySchema = reportPeriodQuerySchema.extend({
  coverageDays: z.coerce.number().int().positive().max(365).optional(),
  alertDays: z.coerce.number().int().positive().max(365).optional(),
});

export type ReorderSuggestionQuery = z.infer<typeof reorderSuggestionQuerySchema>;

export const reorderSuggestionItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  stockQuantity: z.number().int(),
  avgDailySales: z.number(),
  daysUntilStockout: z.number().nullable(),
  suggestedReorderQty: z.number().int(),
  needsAttention: z.boolean(),
});

export type ReorderSuggestionItem = z.infer<typeof reorderSuggestionItemSchema>;

export const pricingSuggestionQuerySchema = z.object({
  targetMarginPercent: z.coerce.number().min(0).max(95).optional(),
});

export type PricingSuggestionQuery = z.infer<typeof pricingSuggestionQuerySchema>;

export const pricingSuggestionItemSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  priceCents: z.number().int(),
  costPriceCents: z.number().int(),
  currentMarginPercent: z.number(),
  suggestedPriceCents: z.number().int(),
  belowCost: z.boolean(),
});

export type PricingSuggestionItem = z.infer<typeof pricingSuggestionItemSchema>;
