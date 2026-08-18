import { z } from 'zod';
import { roleSchema } from './role.js';

export const apiKeySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  role: roleSchema,
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type ApiKey = z.infer<typeof apiKeySchema>;

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'Nome obrigatório').max(100),
  role: roleSchema,
  expiresAt: z.string().datetime().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

// Só a resposta de criação carrega a chave crua — nunca mais recuperável
// depois disso, nem pelo próprio backend (só o hash fica salvo).
export const createdApiKeySchema = apiKeySchema.extend({
  rawKey: z.string(),
});

export type CreatedApiKey = z.infer<typeof createdApiKeySchema>;
