import { z } from 'zod';

// Basis points: 0 a 10000 (0% a 100%). Inteiro, mesmo racional de
// earn_rate_points/redeem_value_cents em loyalty — sem ponto flutuante.
const rateBps = z.number().int().min(0).max(10_000);

export const commissionSettingsSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  active: z.boolean(),
  defaultRateBps: rateBps,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CommissionSettings = z.infer<typeof commissionSettingsSchema>;

export const updateCommissionSettingsSchema = z.object({
  active: z.boolean().optional(),
  defaultRateBps: rateBps.optional(),
});

export type UpdateCommissionSettingsInput = z.infer<typeof updateCommissionSettingsSchema>;

export const sellerCommissionRateSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  sellerName: z.string(),
  rateBps,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SellerCommissionRate = z.infer<typeof sellerCommissionRateSchema>;

export const upsertSellerCommissionRateSchema = z.object({
  rateBps,
});

export type UpsertSellerCommissionRateInput = z.infer<typeof upsertSellerCommissionRateSchema>;
