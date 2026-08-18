import { Inject, Injectable } from '@nestjs/common';
import { AbilityBuilder, PureAbility, type AbilityClass } from '@casl/ability';
import { eq, and } from 'drizzle-orm';
import type { JwtPayload, Role } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { userPermissionOverrides, type UserPermissionOverrideRow } from '../../database/schema/index';

export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';

/**
 * Subjects vão crescendo por módulo conforme o roadmap avança
 * (Vendas, Estoque, Financeiro, Fiscal, CRM...). 'all' cobre o wildcard do CASL.
 */
// 'User' cobre só leitura de identidade (listar usuários/convites — baixo
// risco). Convidar/trocar papel viram 'UserAccess', um subject à parte,
// porque concedem controle equivalente a admin (convidar já como admin,
// promover a admin) e por isso NUNCA podem ser alvo de override — ver
// exclusão em permissionSubjectSchema (packages/shared).
export type Subject =
  | 'all'
  | 'Sale'
  | 'CashSession'
  | 'Product'
  | 'Category'
  | 'Customer'
  | 'Supplier'
  | 'StockMovement'
  | 'StockCount'
  | 'FinanceEntry'
  | 'CostCenter'
  | 'PurchaseOrder'
  | 'Report'
  | 'Tenant'
  | 'User'
  | 'UserAccess'
  | 'Store';

export type AppAbility = PureAbility<[Action, Subject]>;

@Injectable()
export class AbilityFactory {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Ponto de entrada real (guard): papel + overrides persistidos do usuário.
  async createForUser(user: JwtPayload): Promise<AppAbility> {
    const overrides = await this.fetchOverrides(user.tenantId, user.sub);
    return this.buildAbility(user.role, overrides);
  }

  // Núcleo puro, sem I/O — testável direto (unit) e reaproveitado por createForUser.
  // Overrides são aplicados DEPOIS das regras do papel: no CASL a última regra que
  // casa com (action, subject) vence, então um `can`/`cannot` de override sempre
  // tem prioridade sobre o default do papel, em qualquer direção (concede ou nega).
  buildAbility(role: Role, overrides: Pick<UserPermissionOverrideRow, 'subject' | 'action' | 'effect'>[] = []): AppAbility {
    const { can, cannot, build } = new AbilityBuilder(PureAbility as AbilityClass<AppAbility>);

    this.defineByRole(role, can);

    // Owner sempre tem acesso total, mesmo que existam overrides órfãos de uma
    // promoção anterior — não é o papel que devia precisar de exceções.
    if (role !== 'owner') {
      for (const override of overrides) {
        const subject = override.subject as Subject;
        const action = override.action as Action;
        if (override.effect === 'allow') {
          can(action, subject);
        } else {
          cannot(action, subject);
        }
      }
    }

    return build();
  }

  private async fetchOverrides(tenantId: string, userId: string): Promise<UserPermissionOverrideRow[]> {
    return this.db
      .select()
      .from(userPermissionOverrides)
      .where(and(eq(userPermissionOverrides.tenantId, tenantId), eq(userPermissionOverrides.userId, userId)));
  }

  private defineByRole(
    role: Role,
    can: AbilityBuilder<AppAbility>['can'],
  ): void {
    switch (role) {
      case 'owner':
        can('manage', 'all');
        break;
      case 'admin':
        can('manage', [
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
          'UserAccess',
          'Store',
        ]);
        break;
      case 'financeiro':
        can('manage', ['FinanceEntry', 'CostCenter']);
        can('read', [
          'Sale',
          'CashSession',
          'Product',
          'Category',
          'Customer',
          'Supplier',
          'StockMovement',
          'StockCount',
          'PurchaseOrder',
          'Report',
          'Store',
        ]);
        break;
      case 'operador_caixa':
        can(['create', 'read'], 'Sale');
        can(['create', 'read', 'update'], 'CashSession');
        can('read', ['Product', 'Category', 'Customer', 'Store']);
        break;
    }
  }
}
