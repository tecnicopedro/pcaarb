import { z } from 'zod';
import { fiscalDocumentStatusSchema } from './fiscal-document.js';

export const paymentMethodSchema = z.enum(['dinheiro', 'cartao_credito', 'cartao_debito', 'pix']);

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const saleStatusSchema = z.enum(['completed', 'canceled']);

// Sale by weight/fractional quantity (e.g. produce) is deferred until the
// target audience needs it — the roadmap targets grocery/retail/pet shop/
// pharmacy/convenience stores selling by whole unit (see docs/01). Quantity
// is always an integer.
export const createSaleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive('Quantidade precisa ser maior que zero'),
});

export type CreateSaleItemInput = z.infer<typeof createSaleItemSchema>;

export const createSalePaymentSchema = z.object({
  method: paymentMethodSchema,
  amountCents: z.number().int().positive('Valor do pagamento precisa ser maior que zero'),
});

export type CreateSalePaymentInput = z.infer<typeof createSalePaymentSchema>;

export const createSaleSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  items: z.array(createSaleItemSchema).min(1, 'A venda precisa de ao menos um item'),
  discountCents: z.number().int().nonnegative().optional().default(0),
  // Only takes effect when customerId is provided — redeeming loyalty points
  // requires a customer identified on the sale.
  pointsToRedeem: z.number().int().nonnegative().optional().default(0),
  payments: z.array(createSalePaymentSchema).min(1, 'Informe ao menos uma forma de pagamento'),
  // Generated client-side (crypto.randomUUID()) only by the offline PDV, at
  // the moment the sale is queued — idempotency key for sync: resending the
  // same sale (retry, queue processed twice) returns the sale already
  // created instead of selling again. Absent on a normal online sale.
  clientSaleId: z.string().uuid().optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const saleItemSchema = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  unitPriceCents: z.number().int(),
  quantity: z.number().int(),
  totalCents: z.number().int(),
});

export type SaleItem = z.infer<typeof saleItemSchema>;

export const salePaymentSchema = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  method: paymentMethodSchema,
  amountCents: z.number().int(),
  providerTransactionId: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type SalePayment = z.infer<typeof salePaymentSchema>;

export const saleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  storeId: z.string().uuid(),
  cashSessionId: z.string().uuid(),
  customerId: z.string().uuid().nullable(),
  sellerId: z.string().uuid(),
  status: saleStatusSchema,
  subtotalCents: z.number().int(),
  discountCents: z.number().int(),
  totalCents: z.number().int(),
  clientSaleId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  pointsRedeemed: z.number().int(),
  pointsEarned: z.number().int(),
  items: z.array(saleItemSchema),
  payments: z.array(salePaymentSchema),
  fiscalDocument: z
    .object({
      id: z.string().uuid(),
      status: fiscalDocumentStatusSchema,
      accessKey: z.string().nullable(),
      documentUrl: z.string().nullable(),
      rejectionReason: z.string().nullable(),
    })
    .nullable(),
});

export type Sale = z.infer<typeof saleSchema>;

// Shape for GET /sales (list): without items/payments/fiscalDocument, which
// only come in the detail view (GET /sales/:id) — avoids N+1 to build the history.
export const saleListItemSchema = saleSchema.omit({
  items: true,
  payments: true,
  fiscalDocument: true,
  pointsRedeemed: true,
  pointsEarned: true,
});

export type SaleListItem = z.infer<typeof saleListItemSchema>;
