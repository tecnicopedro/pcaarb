import { z } from 'zod';

export const costCenterSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});

export type CostCenter = z.infer<typeof costCenterSchema>;

export const createCostCenterSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').max(120),
});

export type CreateCostCenterInput = z.infer<typeof createCostCenterSchema>;

export const updateCostCenterSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').max(120).optional(),
  active: z.boolean().optional(),
});

export type UpdateCostCenterInput = z.infer<typeof updateCostCenterSchema>;
