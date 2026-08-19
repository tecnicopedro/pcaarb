import { z } from 'zod';

export const saleReturnRefundMethodSchema = z.enum(['dinheiro', 'estorno_pagamento', 'outro']);

export type SaleReturnRefundMethod = z.infer<typeof saleReturnRefundMethodSchema>;

export const saleReturnStatusSchema = z.enum(['completed', 'needs_attention']);

export type SaleReturnStatus = z.infer<typeof saleReturnStatusSchema>;

export const createSaleReturnItemSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.number().int().positive('Quantidade precisa ser maior que zero'),
});

export type CreateSaleReturnItemInput = z.infer<typeof createSaleReturnItemSchema>;

export const createSaleReturnSchema = z.object({
  refundMethod: saleReturnRefundMethodSchema,
  reason: z.string().min(3, 'Descreva o motivo da devolução').max(500),
  items: z.array(createSaleReturnItemSchema).min(1, 'A devolução precisa de ao menos um item'),
});

export type CreateSaleReturnInput = z.infer<typeof createSaleReturnSchema>;

export const saleReturnItemSchema = z.object({
  id: z.string().uuid(),
  saleReturnId: z.string().uuid(),
  saleItemId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  refundedCents: z.number().int(),
  applied: z.boolean(),
  issue: z.string().nullable(),
});

export type SaleReturnItem = z.infer<typeof saleReturnItemSchema>;

export const saleReturnSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  saleId: z.string().uuid(),
  processedBy: z.string().uuid(),
  cashSessionId: z.string().uuid().nullable(),
  refundMethod: saleReturnRefundMethodSchema,
  reason: z.string(),
  status: saleReturnStatusSchema,
  issue: z.string().nullable(),
  totalRefundedCents: z.number().int(),
  fiscalDocumentId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  items: z.array(saleReturnItemSchema),
});

export type SaleReturn = z.infer<typeof saleReturnSchema>;
