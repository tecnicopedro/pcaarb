import { z } from 'zod';

export const purchaseOrderStatusSchema = z.enum(['draft', 'received', 'canceled']);

export type PurchaseOrderStatus = z.infer<typeof purchaseOrderStatusSchema>;

export const createPurchaseOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive('Quantidade precisa ser maior que zero'),
  unitCostCents: z.number().int().positive('Custo unitário precisa ser maior que zero'),
});

export type CreatePurchaseOrderItemInput = z.infer<typeof createPurchaseOrderItemSchema>;

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  notes: z.string().max(500).optional(),
  items: z.array(createPurchaseOrderItemSchema).min(1, 'O pedido precisa de ao menos um item'),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const purchaseOrderItemSchema = z.object({
  id: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  unitCostCents: z.number().int(),
  quantity: z.number().int(),
  totalCents: z.number().int(),
});

export type PurchaseOrderItem = z.infer<typeof purchaseOrderItemSchema>;

export const purchaseOrderSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  supplierId: z.string().uuid(),
  status: purchaseOrderStatusSchema,
  notes: z.string().nullable(),
  totalCents: z.number().int(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  receivedAt: z.string().datetime().nullable(),
  items: z.array(purchaseOrderItemSchema),
});

export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;
