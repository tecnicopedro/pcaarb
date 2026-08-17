import { z } from 'zod';

export const stockCountStatusSchema = z.enum(['open', 'completed', 'canceled']);

export type StockCountStatus = z.infer<typeof stockCountStatusSchema>;

export const stockCountItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  stockCountId: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  expectedQuantity: z.number().int(),
  countedQuantity: z.number().int().nullable(),
});

export type StockCountItem = z.infer<typeof stockCountItemSchema>;

export const stockCountSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  status: stockCountStatusSchema,
  notes: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  items: z.array(stockCountItemSchema),
});

export type StockCount = z.infer<typeof stockCountSchema>;

export const createStockCountSchema = z.object({
  notes: z.string().max(500).optional(),
});

export type CreateStockCountInput = z.infer<typeof createStockCountSchema>;

export const updateStockCountItemSchema = z.object({
  countedQuantity: z.number().int().min(0, 'Quantidade contada não pode ser negativa'),
});

export type UpdateStockCountItemInput = z.infer<typeof updateStockCountItemSchema>;
