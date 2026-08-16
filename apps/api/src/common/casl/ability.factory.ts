import { Injectable } from '@nestjs/common';
import { AbilityBuilder, PureAbility, type AbilityClass } from '@casl/ability';
import type { JwtPayload, Role } from '@pcaarb/shared';

export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';

/**
 * Subjects vão crescendo por módulo conforme o roadmap avança
 * (Vendas, Estoque, Financeiro, Fiscal, CRM...). 'all' cobre o wildcard do CASL.
 */
export type Subject = 'all' | 'Sale' | 'Product' | 'FinanceEntry' | 'Tenant' | 'User';

export type AppAbility = PureAbility<[Action, Subject]>;

@Injectable()
export class AbilityFactory {
  createForUser(user: JwtPayload): AppAbility {
    const { can, build } = new AbilityBuilder(PureAbility as AbilityClass<AppAbility>);

    this.defineByRole(user.role, can);

    return build();
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
        can('manage', ['Sale', 'Product', 'FinanceEntry', 'User']);
        break;
      case 'financeiro':
        can('manage', 'FinanceEntry');
        can('read', ['Sale', 'Product']);
        break;
      case 'operador_caixa':
        can(['create', 'read'], 'Sale');
        can('read', 'Product');
        break;
    }
  }
}
