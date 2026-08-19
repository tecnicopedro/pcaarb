import { z } from 'zod';

export const stockMovementTypeSchema = z.enum(['entrada', 'saida', 'ajuste']);

export const stockMovementSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  productId: z.string().uuid(),
  type: stockMovementTypeSchema,
  // Already-signed delta (negative on outflow), reflecting the actual effect on the balance.
  quantity: z.number().int(),
  reason: z.string().nullable(),
  saleId: z.string().uuid().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export type StockMovement = z.infer<typeof stockMovementSchema>;

// For entrada/saída (inflow/outflow), quantity is the magnitude (always
// positive) of what came in or went out. For ajuste (count correction),
// quantity is the signed delta to apply — can be negative to correct the
// balance downward.
export const createStockMovementSchema = z
  .object({
    type: stockMovementTypeSchema,
    quantity: z.number().int(),
    reason: z.string().max(200).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== 'ajuste' && data.quantity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Quantidade precisa ser maior que zero',
        path: ['quantity'],
      });
    }
    if (data.type === 'ajuste' && data.quantity === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ajuste não pode ter quantidade zero',
        path: ['quantity'],
      });
    }
  });

export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>;
