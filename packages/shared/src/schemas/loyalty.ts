import { z } from 'zod';

export const loyaltyProgramSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  active: z.boolean(),
  earnRatePoints: z.number().int().nonnegative(),
  redeemValueCents: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type LoyaltyProgram = z.infer<typeof loyaltyProgramSchema>;

export const updateLoyaltyProgramSchema = z.object({
  active: z.boolean().optional(),
  earnRatePoints: z.number().int().nonnegative().optional(),
  redeemValueCents: z.number().int().positive().optional(),
});

export type UpdateLoyaltyProgramInput = z.infer<typeof updateLoyaltyProgramSchema>;

export const loyaltyLedgerTypeSchema = z.enum(['earn', 'redeem', 'adjustment']);

export const loyaltyLedgerEntrySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  customerId: z.string().uuid(),
  saleId: z.string().uuid().nullable(),
  type: loyaltyLedgerTypeSchema,
  points: z.number().int(),
  note: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export type LoyaltyLedgerEntry = z.infer<typeof loyaltyLedgerEntrySchema>;

export const customerLoyaltyBalanceSchema = z.object({
  customerId: z.string().uuid(),
  balancePoints: z.number().int(),
  balanceValueCents: z.number().int(),
});

export type CustomerLoyaltyBalance = z.infer<typeof customerLoyaltyBalanceSchema>;
