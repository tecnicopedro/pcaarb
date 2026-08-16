import { describe, expect, it } from 'vitest';
import type { JwtPayload } from '@pcaarb/shared';
import { AbilityFactory } from './ability.factory';

const basePayload = { sub: 'user-1', tenantId: 'tenant-1' } satisfies Partial<JwtPayload>;

describe('AbilityFactory', () => {
  const factory = new AbilityFactory();

  it('owner pode gerenciar qualquer subject', () => {
    const ability = factory.createForUser({ ...basePayload, role: 'owner' });
    expect(ability.can('manage', 'FinanceEntry')).toBe(true);
    expect(ability.can('delete', 'User')).toBe(true);
  });

  it('operador de caixa só pode criar/ler vendas e ler produtos', () => {
    const ability = factory.createForUser({ ...basePayload, role: 'operador_caixa' });
    expect(ability.can('create', 'Sale')).toBe(true);
    expect(ability.can('read', 'Product')).toBe(true);
    expect(ability.can('manage', 'FinanceEntry')).toBe(false);
    expect(ability.can('delete', 'Sale')).toBe(false);
  });

  it('financeiro não acessa gestão de usuários', () => {
    const ability = factory.createForUser({ ...basePayload, role: 'financeiro' });
    expect(ability.can('manage', 'FinanceEntry')).toBe(true);
    expect(ability.can('manage', 'User')).toBe(false);
  });
});
