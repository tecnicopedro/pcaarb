import { z } from 'zod';

export const permissionActionSchema = z.enum(['manage', 'create', 'read', 'update', 'delete']);

export type PermissionAction = z.infer<typeof permissionActionSchema>;

// Mirrors CASL's `Subject` (apps/api/src/common/casl/ability.factory.ts),
// except 'all', 'Tenant', 'UserAccess', 'Integration' and 'AuditLog' — an override
// must not grant tenant-level access, the wildcard, or the ability to
// invite/change a user's role ('UserAccess'), so it can't become a
// privilege-escalation path outside the owner/admin role. 'User' here only
// covers identity reads (listing users/invites); UserAccess is managed only
// by the base role, never by override — see ability.factory.ts.
//
// 'Integration' was excluded after a security review finding
// (2026-08-18): it's the same subject that gates POST /api-keys, which mints
// a durable credential with whatever `role` the caller requests (it only
// blocked role:'owner' for non-owners). A financeiro/operador_caixa with a
// one-off 'Integration' override — something that sounds harmless, like
// "let this person configure the marketplace integration" — could use that
// same permission to mint an API key with role:'admin', gaining durable
// admin-equivalent access. Same class of bug that motivated excluding
// 'UserAccess' above; same fix.
//
// 'AuditLog' has been excluded since the subject was created (not a fix for
// a finding) — reading the audit log of sensitive actions is owner-only by
// nature, same reasoning as 'Tenant': delegating this via override would let
// an admin grant themselves (or another user) visibility into actions the
// business owner might not want exposed.
// 'DataPrivacy' gets the same treatment, for the same reason: bulk
// export/anonymization of customer personal data is a business-owner decision.
export const permissionSubjectSchema = z.enum([
  'Sale',
  'SaleReturn',
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
  'Store',
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
