import { z } from 'zod';
import { roleSchema } from './role.js';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Senha obrigatória'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export type AuthTokens = z.infer<typeof authTokensSchema>;

export const jwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: roleSchema,
});

export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
