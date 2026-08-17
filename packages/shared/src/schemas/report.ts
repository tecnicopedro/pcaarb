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
