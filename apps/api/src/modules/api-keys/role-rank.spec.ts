import { describe, expect, it } from 'vitest';
import { canAssignApiKeyRole } from './role-rank';

describe('canAssignApiKeyRole', () => {
  it('permite criar chave com o próprio papel', () => {
    expect(canAssignApiKeyRole('owner', 'owner')).toBe(true);
    expect(canAssignApiKeyRole('admin', 'admin')).toBe(true);
    expect(canAssignApiKeyRole('financeiro', 'financeiro')).toBe(true);
    expect(canAssignApiKeyRole('operador_caixa', 'operador_caixa')).toBe(true);
  });

  it('permite criar chave com papel de menor privilégio', () => {
    expect(canAssignApiKeyRole('owner', 'admin')).toBe(true);
    expect(canAssignApiKeyRole('admin', 'financeiro')).toBe(true);
    expect(canAssignApiKeyRole('admin', 'operador_caixa')).toBe(true);
  });

  it('bloqueia criar chave com papel de maior privilégio (o bug real: financeiro/operador_caixa mintando admin)', () => {
    expect(canAssignApiKeyRole('admin', 'owner')).toBe(false);
    expect(canAssignApiKeyRole('financeiro', 'admin')).toBe(false);
    expect(canAssignApiKeyRole('operador_caixa', 'admin')).toBe(false);
    expect(canAssignApiKeyRole('financeiro', 'owner')).toBe(false);
    expect(canAssignApiKeyRole('operador_caixa', 'owner')).toBe(false);
  });

  it('financeiro e operador_caixa são pares — cada um pode mintar chave com o papel lateral do outro (não é escalonamento vertical)', () => {
    expect(canAssignApiKeyRole('financeiro', 'operador_caixa')).toBe(true);
    expect(canAssignApiKeyRole('operador_caixa', 'financeiro')).toBe(true);
  });
});
