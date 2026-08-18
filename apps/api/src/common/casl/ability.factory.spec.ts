import { describe, expect, it } from 'vitest';
import type { Database } from '../../database/drizzle.provider';
import { AbilityFactory } from './ability.factory';

describe('AbilityFactory', () => {
  // buildAbility() é puro (não usa this.db) — dummy value só pra satisfazer o
  // construtor, sem precisar de um Database real nestes testes.
  const factory = new AbilityFactory({} as Database);

  it('owner pode gerenciar qualquer subject', () => {
    const ability = factory.buildAbility('owner');
    expect(ability.can('manage', 'FinanceEntry')).toBe(true);
    expect(ability.can('delete', 'User')).toBe(true);
  });

  it('operador de caixa só pode criar/ler vendas e ler produtos/categorias/clientes', () => {
    const ability = factory.buildAbility('operador_caixa');
    expect(ability.can('create', 'Sale')).toBe(true);
    expect(ability.can('read', 'Product')).toBe(true);
    expect(ability.can('read', 'Customer')).toBe(true);
    expect(ability.can('create', 'Product')).toBe(false);
    expect(ability.can('manage', 'FinanceEntry')).toBe(false);
    expect(ability.can('delete', 'Sale')).toBe(false);
  });

  it('operador de caixa abre/fecha caixa e registra sangria/suprimento, mas não apaga sessão', () => {
    const ability = factory.buildAbility('operador_caixa');
    expect(ability.can('create', 'CashSession')).toBe(true);
    expect(ability.can('update', 'CashSession')).toBe(true);
    expect(ability.can('read', 'CashSession')).toBe(true);
    expect(ability.can('delete', 'CashSession')).toBe(false);
  });

  it('financeiro não acessa gestão de usuários nem de cadastros', () => {
    const ability = factory.buildAbility('financeiro');
    expect(ability.can('manage', 'FinanceEntry')).toBe(true);
    expect(ability.can('read', 'Supplier')).toBe(true);
    expect(ability.can('manage', 'User')).toBe(false);
    expect(ability.can('create', 'Product')).toBe(false);
  });

  it('admin gerencia UserAccess (convite/troca de papel), operador de caixa não acessa', () => {
    const admin = factory.buildAbility('admin');
    expect(admin.can('create', 'UserAccess')).toBe(true);
    expect(admin.can('update', 'UserAccess')).toBe(true);

    const financeiro = factory.buildAbility('financeiro');
    expect(financeiro.can('update', 'UserAccess')).toBe(false);

    const operadorCaixa = factory.buildAbility('operador_caixa');
    expect(operadorCaixa.can('update', 'UserAccess')).toBe(false);
    expect(operadorCaixa.can('create', 'UserAccess')).toBe(false);
  });

  it('admin gerencia cadastros (produto, categoria, cliente, fornecedor)', () => {
    const ability = factory.buildAbility('admin');
    expect(ability.can('manage', 'Product')).toBe(true);
    expect(ability.can('manage', 'Category')).toBe(true);
    expect(ability.can('manage', 'Customer')).toBe(true);
    expect(ability.can('manage', 'Supplier')).toBe(true);
  });

  it('admin e financeiro acessam estoque, mas operador de caixa não movimenta manualmente', () => {
    const admin = factory.buildAbility('admin');
    expect(admin.can('manage', 'StockMovement')).toBe(true);

    const financeiro = factory.buildAbility('financeiro');
    expect(financeiro.can('read', 'StockMovement')).toBe(true);
    expect(financeiro.can('create', 'StockMovement')).toBe(false);

    const operadorCaixa = factory.buildAbility('operador_caixa');
    expect(operadorCaixa.can('read', 'StockMovement')).toBe(false);
    expect(operadorCaixa.can('create', 'StockMovement')).toBe(false);
  });

  it('admin gerencia pedidos de compra, financeiro só lê, operador de caixa não acessa', () => {
    const admin = factory.buildAbility('admin');
    expect(admin.can('manage', 'PurchaseOrder')).toBe(true);

    const financeiro = factory.buildAbility('financeiro');
    expect(financeiro.can('read', 'PurchaseOrder')).toBe(true);
    expect(financeiro.can('create', 'PurchaseOrder')).toBe(false);

    const operadorCaixa = factory.buildAbility('operador_caixa');
    expect(operadorCaixa.can('read', 'PurchaseOrder')).toBe(false);
    expect(operadorCaixa.can('create', 'PurchaseOrder')).toBe(false);
  });

  it('admin gerencia contagens de estoque, financeiro só lê, operador de caixa não acessa', () => {
    const admin = factory.buildAbility('admin');
    expect(admin.can('manage', 'StockCount')).toBe(true);

    const financeiro = factory.buildAbility('financeiro');
    expect(financeiro.can('read', 'StockCount')).toBe(true);
    expect(financeiro.can('create', 'StockCount')).toBe(false);

    const operadorCaixa = factory.buildAbility('operador_caixa');
    expect(operadorCaixa.can('read', 'StockCount')).toBe(false);
    expect(operadorCaixa.can('create', 'StockCount')).toBe(false);
  });

  it('admin e financeiro gerenciam centro de custo, operador de caixa não acessa', () => {
    const admin = factory.buildAbility('admin');
    expect(admin.can('manage', 'CostCenter')).toBe(true);

    const financeiro = factory.buildAbility('financeiro');
    expect(financeiro.can('manage', 'CostCenter')).toBe(true);

    const operadorCaixa = factory.buildAbility('operador_caixa');
    expect(operadorCaixa.can('read', 'CostCenter')).toBe(false);
    expect(operadorCaixa.can('create', 'CostCenter')).toBe(false);
  });

  it('admin e financeiro leem relatórios, operador de caixa não acessa', () => {
    const admin = factory.buildAbility('admin');
    expect(admin.can('read', 'Report')).toBe(true);

    const financeiro = factory.buildAbility('financeiro');
    expect(financeiro.can('read', 'Report')).toBe(true);

    const operadorCaixa = factory.buildAbility('operador_caixa');
    expect(operadorCaixa.can('read', 'Report')).toBe(false);
  });

  it('admin gerencia lojas; financeiro e operador de caixa só leem (precisam escolher loja no caixa/relatório)', () => {
    const admin = factory.buildAbility('admin');
    expect(admin.can('manage', 'Store')).toBe(true);

    const financeiro = factory.buildAbility('financeiro');
    expect(financeiro.can('read', 'Store')).toBe(true);
    expect(financeiro.can('create', 'Store')).toBe(false);

    const operadorCaixa = factory.buildAbility('operador_caixa');
    expect(operadorCaixa.can('read', 'Store')).toBe(true);
    expect(operadorCaixa.can('create', 'Store')).toBe(false);
  });

  describe('overrides por usuário', () => {
    it('override "allow" concede acesso além do papel base', () => {
      const semOverride = factory.buildAbility('operador_caixa');
      expect(semOverride.can('read', 'Report')).toBe(false);

      const comOverride = factory.buildAbility('operador_caixa', [{ subject: 'Report', action: 'read', effect: 'allow' }]);
      expect(comOverride.can('read', 'Report')).toBe(true);
      // Resto do papel continua igual — override é pontual, não vira outro papel.
      expect(comOverride.can('manage', 'FinanceEntry')).toBe(false);
    });

    it('override "deny" revoga acesso que o papel base concederia', () => {
      const semOverride = factory.buildAbility('admin');
      expect(semOverride.can('manage', 'FinanceEntry')).toBe(true);

      const comOverride = factory.buildAbility('admin', [{ subject: 'FinanceEntry', action: 'manage', effect: 'deny' }]);
      expect(comOverride.can('manage', 'FinanceEntry')).toBe(false);
      // Resto do papel continua igual.
      expect(comOverride.can('manage', 'Product')).toBe(true);
    });

    it('owner ignora overrides — nunca perde acesso total', () => {
      const ability = factory.buildAbility('owner', [{ subject: 'User', action: 'delete', effect: 'deny' }]);
      expect(ability.can('delete', 'User')).toBe(true);
      expect(ability.can('manage', 'all')).toBe(true);
    });

    it('override em "User" nunca concede UserAccess (convite/troca de papel é imune a override)', () => {
      // 'User' e 'UserAccess' são subjects distintos por isso: um override
      // update:User (pensado como algo pontual) não deve destravar convite
      // nem troca de papel — só o papel base admin/owner concede UserAccess.
      const ability = factory.buildAbility('operador_caixa', [
        { subject: 'User', action: 'update', effect: 'allow' },
        { subject: 'User', action: 'create', effect: 'allow' },
        { subject: 'User', action: 'manage', effect: 'allow' },
      ]);
      expect(ability.can('update', 'UserAccess')).toBe(false);
      expect(ability.can('create', 'UserAccess')).toBe(false);
    });

    it('múltiplos overrides no mesmo usuário são todos aplicados de forma independente', () => {
      const ability = factory.buildAbility('operador_caixa', [
        { subject: 'Report', action: 'read', effect: 'allow' },
        { subject: 'FinanceEntry', action: 'read', effect: 'allow' },
        { subject: 'Sale', action: 'create', effect: 'deny' },
      ]);
      expect(ability.can('read', 'Report')).toBe(true);
      expect(ability.can('read', 'FinanceEntry')).toBe(true);
      expect(ability.can('create', 'Sale')).toBe(false);
      expect(ability.can('read', 'Sale')).toBe(true); // não mexido pelo deny específico de 'create'
    });
  });
});
