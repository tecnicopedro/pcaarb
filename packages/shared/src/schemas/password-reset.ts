import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// Mesma regra de senha de acceptInviteSchema (packages/shared/src/schemas/user-invite.ts).
export const resetPasswordSchema = z.object({
  id: z.string().uuid(),
  token: z.string().min(1),
  password: z
    .string()
    .min(10, 'Mínimo de 10 caracteres')
    .regex(/[A-Z]/, 'Precisa de ao menos uma letra maiúscula')
    .regex(/[a-z]/, 'Precisa de ao menos uma letra minúscula')
    .regex(/[0-9]/, 'Precisa de ao menos um número'),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
