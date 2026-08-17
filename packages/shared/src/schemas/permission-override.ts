import { z } from 'zod';

export const permissionActionSchema = z.enum(['manage', 'create', 'read', 'update', 'delete']);

export type PermissionAction = z.infer<typeof permissionActionSchema>;

// Espelha o `Subject` do CASL (apps/api/src/common/casl/ability.factory.ts),
// exceto 'all' e 'Tenant' — override não pode conceder acesso de nível tenant
// nem o wildcard, pra não virar um caminho de escalonamento de privilégio por
// fora do papel de owner.
export const permissionSubjectSchema = z.enum([
  'Sale',
  'CashSession',
  'Product',
  'Category',
  'Customer',
  'Supplier',
  'StockMovement',
  'StockCount',
  'FinanceEntry',
  'CostCenter',
  'PurchaseOrder',
  'Report',
  'User',
]);

export type PermissionSubject = z.infer<typeof permissionSubjectSchema>;

export const permissionEffectSchema = z.enum(['allow', 'deny']);

export type PermissionEffect = z.infer<typeof permissionEffectSchema>;

export const permissionOverrideSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  subject: permissionSubjectSchema,
  action: permissionActionSchema,
  effect: permissionEffectSchema,
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export type PermissionOverride = z.infer<typeof permissionOverrideSchema>;

export const createPermissionOverrideSchema = z.object({
  subject: permissionSubjectSchema,
  action: permissionActionSchema,
  effect: permissionEffectSchema,
});

export type CreatePermissionOverrideInput = z.infer<typeof createPermissionOverrideSchema>;
