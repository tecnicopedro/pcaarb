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

  it('operador de caixa só pode criar/ler vendas e ler produtos/categorias/clientes', () => {
    const ability = factory.createForUser({ ...basePayload, role: 'operador_caixa' });
    expect(ability.can('create', 'Sale')).toBe(true);
    expect(ability.can('read', 'Product')).toBe(true);
    expect(ability.can('read', 'Customer')).toBe(true);
    expect(ability.can('create', 'Product')).toBe(false);
    expect(ability.can('manage', 'FinanceEntry')).toBe(false);
    expect(ability.can('delete', 'Sale')).toBe(false);
  });

  it('operador de caixa abre/fecha caixa e registra sangria/suprimento, mas não apaga sessão', () => {
    const ability = factory.createForUser({ ...basePayload, role: 'operador_caixa' });
    expect(ability.can('create', 'CashSession')).toBe(true);
    expect(ability.can('update', 'CashSession')).toBe(true);
    expect(ability.can('read', 'CashSession')).toBe(true);
    expect(ability.can('delete', 'CashSession')).toBe(false);
  });

  it('financeiro não acessa gestão de usuários nem de cadastros', () => {
    const ability = factory.createForUser({ ...basePayload, role: 'financeiro' });
    expect(ability.can('manage', 'FinanceEntry')).toBe(true);
    expect(ability.can('read', 'Supplier')).toBe(true);
    expect(ability.can('manage', 'User')).toBe(false);
    expect(ability.can('create', 'Product')).toBe(false);
  });

  it('admin gerencia cadastros (produto, categoria, cliente, fornecedor)', () => {
    const ability = factory.createForUser({ ...basePayload, role: 'admin' });
    expect(ability.can('manage', 'Product')).toBe(true);
    expect(ability.can('manage', 'Category')).toBe(true);
    expect(ability.can('manage', 'Customer')).toBe(true);
    expect(ability.can('manage', 'Supplier')).toBe(true);
  });
});
