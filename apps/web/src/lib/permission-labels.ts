import type { PermissionAction, PermissionSubject } from '@pcaarb/shared';

export const PERMISSION_SUBJECT_LABELS: Record<PermissionSubject, string> = {
  Sale: 'Vendas',
  CashSession: 'Caixa',
  Product: 'Produtos',
  Category: 'Categorias',
  Customer: 'Clientes',
  Supplier: 'Fornecedores',
  StockMovement: 'Movimentação de estoque',
  StockCount: 'Inventário',
  FinanceEntry: 'Financeiro',
  CostCenter: 'Centro de custo',
  PurchaseOrder: 'Compras',
  Report: 'Relatórios',
  User: 'Usuários',
  Store: 'Lojas',
  Integration: 'Integrações',
};

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  manage: 'Gerenciar tudo',
  create: 'Criar',
  read: 'Ler',
  update: 'Editar',
  delete: 'Excluir',
};
