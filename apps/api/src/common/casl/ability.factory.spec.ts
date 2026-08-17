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

  it('admin e financeiro acessam estoque, mas operador de caixa não movimenta manualmente', () => {
    const admin = factory.createForUser({ ...basePayload, role: 'admin' });
    expect(admin.can('manage', 'StockMovement')).toBe(true);

    const financeiro = factory.createForUser({ ...basePayload, role: 'financeiro' });
    expect(financeiro.can('read', 'StockMovement')).toBe(true);
    expect(financeiro.can('create', 'StockMovement')).toBe(false);

    const operadorCaixa = factory.createForUser({ ...basePayload, role: 'operador_caixa' });
    expect(operadorCaixa.can('read', 'StockMovement')).toBe(false);
    expect(operadorCaixa.can('create', 'StockMovement')).toBe(false);
  });

  it('admin gerencia pedidos de compra, financeiro só lê, operador de caixa não acessa', () => {
    const admin = factory.createForUser({ ...basePayload, role: 'admin' });
    expect(admin.can('manage', 'PurchaseOrder')).toBe(true);

    const financeiro = factory.createForUser({ ...basePayload, role: 'financeiro' });
    expect(financeiro.can('read', 'PurchaseOrder')).toBe(true);
    expect(financeiro.can('create', 'PurchaseOrder')).toBe(false);

    const operadorCaixa = factory.createForUser({ ...basePayload, role: 'operador_caixa' });
    expect(operadorCaixa.can('read', 'PurchaseOrder')).toBe(false);
    expect(operadorCaixa.can('create', 'PurchaseOrder')).toBe(false);
  });

  it('admin gerencia contagens de estoque, financeiro só lê, operador de caixa não acessa', () => {
    const admin = factory.createForUser({ ...basePayload, role: 'admin' });
    expect(admin.can('manage', 'StockCount')).toBe(true);

    const financeiro = factory.createForUser({ ...basePayload, role: 'financeiro' });
    expect(financeiro.can('read', 'StockCount')).toBe(true);
    expect(financeiro.can('create', 'StockCount')).toBe(false);

    const operadorCaixa = factory.createForUser({ ...basePayload, role: 'operador_caixa' });
    expect(operadorCaixa.can('read', 'StockCount')).toBe(false);
    expect(operadorCaixa.can('create', 'StockCount')).toBe(false);
  });

  it('admin e financeiro gerenciam centro de custo, operador de caixa não acessa', () => {
    const admin = factory.createForUser({ ...basePayload, role: 'admin' });
    expect(admin.can('manage', 'CostCenter')).toBe(true);

    const financeiro = factory.createForUser({ ...basePayload, role: 'financeiro' });
    expect(financeiro.can('manage', 'CostCenter')).toBe(true);

    const operadorCaixa = factory.createForUser({ ...basePayload, role: 'operador_caixa' });
    expect(operadorCaixa.can('read', 'CostCenter')).toBe(false);
    expect(operadorCaixa.can('create', 'CostCenter')).toBe(false);
  });

  it('admin e financeiro leem relatórios, operador de caixa não acessa', () => {
    const admin = factory.createForUser({ ...basePayload, role: 'admin' });
    expect(admin.can('read', 'Report')).toBe(true);

    const financeiro = factory.createForUser({ ...basePayload, role: 'financeiro' });
    expect(financeiro.can('read', 'Report')).toBe(true);

    const operadorCaixa = factory.createForUser({ ...basePayload, role: 'operador_caixa' });
    expect(operadorCaixa.can('read', 'Report')).toBe(false);
  });
});
