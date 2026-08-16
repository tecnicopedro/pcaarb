import { z } from 'zod';

export const supplierSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  document: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type Supplier = z.infer<typeof supplierSchema>;

export const createSupplierSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').max(160),
  document: z
    .string()
    .regex(/^\d{11}$|^\d{14}$/, 'CPF (11 dígitos) ou CNPJ (14 dígitos), somente números')
    .nullable()
    .optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();

export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
