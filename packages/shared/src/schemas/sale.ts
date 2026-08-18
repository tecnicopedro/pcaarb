import { z } from 'zod';
import { fiscalDocumentStatusSchema } from './fiscal-document.js';

export const paymentMethodSchema = z.enum(['dinheiro', 'cartao_credito', 'cartao_debito', 'pix']);

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const saleStatusSchema = z.enum(['completed', 'canceled']);

// Venda por peso/fracionada (ex.: hortifruti) fica para quando o público-alvo
// exigir — o roadmap mira mercearia/loja/pet shop/farmácia/conveniência com
// venda por unidade inteira (ver docs/01). Quantidade é sempre inteira.
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
  // Só tem efeito com customerId informado — resgate de pontos de fidelidade
  // exige um cliente identificado na venda.
  pointsToRedeem: z.number().int().nonnegative().optional().default(0),
  payments: z.array(createSalePaymentSchema).min(1, 'Informe ao menos uma forma de pagamento'),
  // Gerado no cliente (crypto.randomUUID()) só pelo PDV offline, no momento
  // em que a venda é enfileirada — chave de idempotência pro sync: reenviar
  // a mesma venda (retry, fila processada duas vezes) devolve a venda já
  // criada em vez de vender de novo. Ausente numa venda online normal.
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

// Formato de GET /sales (lista): sem items/payments/fiscalDocument, que só
// vêm no detalhe (GET /sales/:id) — evita N+1 pra montar o histórico.
export const saleListItemSchema = saleSchema.omit({
  items: true,
  payments: true,
  fiscalDocument: true,
  pointsRedeemed: true,
  pointsEarned: true,
});

export type SaleListItem = z.infer<typeof saleListItemSchema>;
