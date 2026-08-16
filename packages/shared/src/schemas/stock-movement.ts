import { z } from 'zod';

export const stockMovementTypeSchema = z.enum(['entrada', 'saida', 'ajuste']);

export const stockMovementSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  productId: z.string().uuid(),
  type: stockMovementTypeSchema,
  // Delta já assinado (negativo em saída), refletindo o efeito real no saldo.
  quantity: z.number().int(),
  reason: z.string().nullable(),
  saleId: z.string().uuid().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export type StockMovement = z.infer<typeof stockMovementSchema>;

// Para entrada/saída, quantity é a magnitude (sempre positiva) do que entrou
// ou saiu. Para ajuste (correção de contagem), quantity é o delta assinado a
// aplicar — pode ser negativo para corrigir saldo para baixo.
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
