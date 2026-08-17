import { z } from 'zod';

export const fiscalDocumentStatusSchema = z.enum(['pending', 'authorized', 'rejected']);

export type FiscalDocumentStatus = z.infer<typeof fiscalDocumentStatusSchema>;

export const fiscalDocumentSchema = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  status: fiscalDocumentStatusSchema,
  accessKey: z.string().nullable(),
  documentUrl: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  issuedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type FiscalDocument = z.infer<typeof fiscalDocumentSchema>;
