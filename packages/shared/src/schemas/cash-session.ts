import { z } from 'zod';

export const cashSessionStatusSchema = z.enum(['open', 'closed']);

export const cashSessionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  storeId: z.string().uuid(),
  openedBy: z.string().uuid(),
  openingAmountCents: z.number().int(),
  openedAt: z.string().datetime(),
  closedBy: z.string().uuid().nullable(),
  closingAmountCents: z.number().int().nullable(),
  closedAt: z.string().datetime().nullable(),
  status: cashSessionStatusSchema,
});

export type CashSession = z.infer<typeof cashSessionSchema>;

export const openCashSessionSchema = z.object({
  storeId: z.string().uuid(),
  openingAmountCents: z.number().int().nonnegative('Valor de abertura não pode ser negativo'),
});

export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;

export const closeCashSessionSchema = z.object({
  closingAmountCents: z.number().int().nonnegative('Valor de fechamento não pode ser negativo'),
});

export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;

// 'estorno' (refund) is only created internally by SaleReturnsService (cash
// refund for a return) — never through the manual movement endpoint,
// which is why it's not included in createCashMovementSchema below.
export const cashMovementTypeSchema = z.enum(['sangria', 'suprimento', 'estorno']);

export const cashMovementSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  cashSessionId: z.string().uuid(),
  type: cashMovementTypeSchema,
  amountCents: z.number().int(),
  reason: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export type CashMovement = z.infer<typeof cashMovementSchema>;

export const manualCashMovementTypeSchema = z.enum(['sangria', 'suprimento']);

export const createCashMovementSchema = z.object({
  type: manualCashMovementTypeSchema,
  amountCents: z.number().int().positive('Valor precisa ser maior que zero'),
  reason: z.string().max(200).nullable().optional(),
});

export type CreateCashMovementInput = z.infer<typeof createCashMovementSchema>;
