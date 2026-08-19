import { z } from 'zod';
import { roleSchema } from './role.js';
import { tenantSchema } from './tenant.js';

export const userSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: roleSchema,
  active: z.boolean(),
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof userSchema>;

export const meSchema = z.object({
  user: userSchema,
  tenant: tenantSchema,
});

export type Me = z.infer<typeof meSchema>;
