import { z } from 'zod';

export const tenantStatusSchema = z.enum(['trial', 'active', 'past_due', 'blocked', 'canceled']);

export const registerTenantSchema = z.object({
  companyName: z.string().min(2, 'Nome da empresa muito curto').max(120),
  document: z
    .string()
    .regex(/^\d{11}$|^\d{14}$/, 'CPF (11 dígitos) ou CNPJ (14 dígitos), somente números'),
  ownerName: z.string().min(2).max(120),
  ownerEmail: z.string().email(),
  password: z
    .string()
    .min(10, 'Mínimo de 10 caracteres')
    .regex(/[A-Z]/, 'Precisa de ao menos uma letra maiúscula')
    .regex(/[a-z]/, 'Precisa de ao menos uma letra minúscula')
    .regex(/[0-9]/, 'Precisa de ao menos um número'),
});

export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

export const tenantSchema = z.object({
  id: z.string().uuid(),
  companyName: z.string(),
  document: z.string(),
  status: tenantStatusSchema,
  trialEndsAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type Tenant = z.infer<typeof tenantSchema>;
