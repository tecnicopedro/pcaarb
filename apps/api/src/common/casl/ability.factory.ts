import { Inject, Injectable } from '@nestjs/common';
import { AbilityBuilder, PureAbility, type AbilityClass } from '@casl/ability';
import { eq, and } from 'drizzle-orm';
import type { JwtPayload, Role } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { userPermissionOverrides, type UserPermissionOverrideRow } from '../../database/schema/index';

export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';

/**
 * Subjects keep growing per module as the roadmap advances
 * (Sales, Stock, Finance, Fiscal, CRM...). 'all' covers CASL's wildcard.
 */
// 'User' covers only identity reads (listing users/invites — low
// risk). Inviting/changing roles become 'UserAccess', a separate subject,
// because they grant admin-equivalent control (inviting already as admin,
// promoting to admin) and therefore can NEVER be an override target — see
// the exclusion in permissionSubjectSchema (packages/shared). 'Integration'
// is also excluded there for the same reason: it gates POST /api-keys, which
// mints a durable credential with the requested role — a one-off override on
// 'Integration' turned into an escalation path to role:'admin'. 'AuditLog'
// is owner-only by design (it's absent from admin's `can('manage', [...])`
// below and from permissionSubjectSchema) — reading the audit log itself
// must not be delegable, otherwise an admin (or worse, an override) could
// hide or check whether their own sensitive actions got logged.
// 'DataPrivacy' (exporting/anonymizing customer personal data) gets the
// same owner-only treatment, for the same reason: bulk access/destruction
// of personal data is a business-owner decision, not delegable.
export type Subject =
  | 'all'
  | 'Sale'
  | 'SaleReturn'
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
  | 'Store'
  | 'Integration'
  | 'AuditLog'
  | 'DataPrivacy';

export type AppAbility = PureAbility<[Action, Subject]>;

@Injectable()
export class AbilityFactory {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Real entry point (guard): role + the user's persisted overrides.
  async createForUser(user: JwtPayload): Promise<AppAbility> {
    const overrides = await this.fetchOverrides(user.tenantId, user.sub);
    return this.buildAbility(user.role, overrides);
  }

  // Pure core, no I/O — directly unit-testable and reused by createForUser.
  // Overrides are applied AFTER the role rules: in CASL the last rule that
  // matches (action, subject) wins, so an override's `can`/`cannot` always
  // takes priority over the role default, in either direction (grant or deny).
  buildAbility(role: Role, overrides: Pick<UserPermissionOverrideRow, 'subject' | 'action' | 'effect'>[] = []): AppAbility {
    const { can, cannot, build } = new AbilityBuilder(PureAbility as AbilityClass<AppAbility>);

    this.defineByRole(role, can);

    // Owner always has full access, even if there are orphaned overrides from
    // an earlier promotion — this isn't a role that should need exceptions.
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
          'SaleReturn',
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
          'Integration',
        ]);
        break;
      case 'financeiro':
        can('manage', ['FinanceEntry', 'CostCenter']);
        can('read', [
          'Sale',
          'SaleReturn',
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
        can(['create', 'read'], 'SaleReturn');
        can(['create', 'read', 'update'], 'CashSession');
        can('read', ['Product', 'Category', 'Customer', 'Store']);
        break;
    }
  }
}
