import { z } from 'zod';
import { roleSchema } from './role.js';

export const userSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: roleSchema,
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof userSchema>;
