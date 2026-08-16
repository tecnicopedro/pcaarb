import { z } from 'zod';

export const roleSchema = z.enum(['owner', 'admin', 'operador_caixa', 'financeiro']);

export type Role = z.infer<typeof roleSchema>;
