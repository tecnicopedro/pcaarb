import type { Role } from '@pcaarb/shared';

// owner > admin > financeiro/operador_caixa (peers, no hierarchy between
// them) — used only to prevent an API key from being minted with more
// privilege than the person creating it already has. The CASL subject
// guarding POST /api-keys ('Integration') is no longer overridable (see
// permission-override.ts in packages/shared, security review finding from
// 2026-08-18), so in practice whoever reaches here today is always
// admin/owner — this check is defense in depth, not the main barrier, so
// it survives even if the subject accidentally becomes overridable again
// in the future.
const ROLE_RANK: Record<Role, number> = {
  owner: 3,
  admin: 2,
  financeiro: 1,
  operador_caixa: 1,
};

export function canAssignApiKeyRole(actingRole: Role, targetRole: Role): boolean {
  return ROLE_RANK[targetRole] <= ROLE_RANK[actingRole];
}
