import { z } from 'zod';

export const storeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});

export type Store = z.infer<typeof storeSchema>;

export const createStoreSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').max(120),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').max(120).optional(),
  active: z.boolean().optional(),
});

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
