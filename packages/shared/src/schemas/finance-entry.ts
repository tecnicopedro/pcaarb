import { z } from 'zod';

export const financeEntryTypeSchema = z.enum(['payable', 'receivable']);
export const financeEntryStatusSchema = z.enum(['pending', 'paid', 'canceled']);

export const financeEntrySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: financeEntryTypeSchema,
  description: z.string(),
  amountCents: z.number().int(),
  dueDate: z.string(),
  status: financeEntryStatusSchema,
  paidAt: z.string().datetime().nullable(),
  customerId: z.string().uuid().nullable(),
  supplierId: z.string().uuid().nullable(),
  costCenterId: z.string().uuid().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type FinanceEntry = z.infer<typeof financeEntrySchema>;

export const createFinanceEntrySchema = z.object({
  type: financeEntryTypeSchema,
  description: z.string().min(2, 'Descrição muito curta').max(200),
  amountCents: z.number().int().positive('Valor precisa ser maior que zero'),
  dueDate: z.string().date('Data de vencimento inválida'),
  customerId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  costCenterId: z.string().uuid().nullable().optional(),
});

export type CreateFinanceEntryInput = z.infer<typeof createFinanceEntrySchema>;

// Editing is only allowed while the entry is pending — status changes through
// a dedicated action (pay/cancel), not through a free-form PATCH.
export const updateFinanceEntrySchema = createFinanceEntrySchema.partial();

export type UpdateFinanceEntryInput = z.infer<typeof updateFinanceEntrySchema>;

export const financeCashflowSummarySchema = z.object({
  pendingReceivableCents: z.number().int(),
  pendingPayableCents: z.number().int(),
  overdueReceivableCents: z.number().int(),
  overduePayableCents: z.number().int(),
  paidReceivableCents: z.number().int(),
  paidPayableCents: z.number().int(),
  netCents: z.number().int(),
});

export type FinanceCashflowSummary = z.infer<typeof financeCashflowSummarySchema>;
