import { z } from 'zod';

export const productSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  sku: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  unit: z.string(),
  // Preço em centavos (inteiro) para evitar erro de arredondamento de ponto
  // flutuante em valores monetários — nunca usar float para dinheiro.
  priceCents: z.number().int(),
  costPriceCents: z.number().int().nullable(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Product = z.infer<typeof productSchema>;

export const createProductSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  sku: z.string().min(1).max(60).nullable().optional(),
  name: z.string().min(2, 'Nome muito curto').max(200),
  description: z.string().max(2000).nullable().optional(),
  unit: z.string().min(1).max(10).default('un'),
  priceCents: z.number().int().nonnegative('Preço não pode ser negativo'),
  costPriceCents: z.number().int().nonnegative().nullable().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().extend({
  active: z.boolean().optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
