import type { Role } from '@pcaarb/shared';

// owner > admin > financeiro/operador_caixa (pares, sem hierarquia entre
// si) — usado só pra impedir que uma chave de API seja mintada com mais
// privilégio do que quem a está criando já tem. O subject CASL que guarda
// POST /api-keys ('Integration') não é mais overridable (ver
// permission-override.ts em packages/shared, achado de revisão de
// segurança de 2026-08-18), então na prática quem chega aqui hoje já é
// sempre admin/owner — este check é defesa em profundidade, não a barreira
// principal, pra sobreviver mesmo se o subject voltar a ser overridable no
// futuro por engano.
const ROLE_RANK: Record<Role, number> = {
  owner: 3,
  admin: 2,
  financeiro: 1,
  operador_caixa: 1,
};

export function canAssignApiKeyRole(actingRole: Role, targetRole: Role): boolean {
  return ROLE_RANK[targetRole] <= ROLE_RANK[actingRole];
}
