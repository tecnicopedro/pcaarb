import { z } from 'zod';
import { roleSchema } from './role.js';

export const userInviteSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  role: roleSchema,
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type UserInvite = z.infer<typeof userInviteSchema>;

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: roleSchema,
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserRoleSchema = z.object({
  role: roleSchema,
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;

export const acceptInviteSchema = z.object({
  inviteId: z.string().uuid(),
  token: z.string().min(1),
  name: z.string().min(2, 'Nome muito curto').max(120),
  password: z
    .string()
    .min(10, 'Mínimo de 10 caracteres')
    .regex(/[A-Z]/, 'Precisa de ao menos uma letra maiúscula')
    .regex(/[a-z]/, 'Precisa de ao menos uma letra minúscula')
    .regex(/[0-9]/, 'Precisa de ao menos um número'),
});

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
