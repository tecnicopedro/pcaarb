import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { CreateStoreInput, UpdateStoreInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { stores, type StoreRow } from '../../database/schema/index';
import { BillingService } from '../billing/billing.service';

// Plans that can operate more than one store — this is literally what the
// Multi-loja plan sells (see SUBSCRIPTION_PLAN_CATALOG). Every account is
// born with one store (TenantsService.registerWithOwner); creating the 2nd
// one is the real gate.
const MULTI_STORE_PLANS = new Set(['multi_loja', 'enterprise']);

@Injectable()
export class StoresService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly billingService: BillingService,
  ) {}

  // Ordered by creation: the default store created at tenant registration
  // always comes first — used by tests and the UI to assume "the first one
  // is the original" without needing another signal.
  async list(tenantId: string): Promise<StoreRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx.select().from(stores).where(eq(stores.tenantId, tenantId)).orderBy(asc(stores.createdAt)),
    );
  }

  async create(tenantId: string, input: CreateStoreInput): Promise<StoreRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const existing = await tx.select({ id: stores.id }).from(stores).where(eq(stores.tenantId, tenantId));
      if (existing.length > 0 && !(await this.hasMultiStoreAccess(tenantId))) {
        throw new ForbiddenException(
          'Operar mais de uma loja exige o plano Multi-loja. Assine ou faça upgrade em /painel/assinatura.',
        );
      }

      const [store] = await tx.insert(stores).values({ tenantId, name: input.name }).returning();
      if (!store) {
        throw new Error('Falha ao criar loja');
      }
      return store;
    });
  }

  // Re-evaluates the plan on every USE, not just on creation — found during
  // a security review (2026-08-17): without this, subscribing to
  // Multi-loja, creating extra stores, and then downgrading back to
  // Starter left the extra stores usable forever (the create() check only
  // ran once). The tenant's oldest store (the default one, created at
  // registration) is never blocked — every tenant needs to be able to
  // operate at least one store, on any plan.
  async assertUsable(tenantId: string, storeId: string): Promise<StoreRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [store] = await tx
        .select()
        .from(stores)
        .where(and(eq(stores.id, storeId), eq(stores.tenantId, tenantId)))
        .limit(1);
      if (!store) {
        throw new NotFoundException('Loja não encontrada');
      }
      if (!store.active) {
        throw new BadRequestException('Loja está inativa');
      }

      const [defaultStore] = await tx
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.tenantId, tenantId))
        .orderBy(asc(stores.createdAt))
        .limit(1);
      const isDefaultStore = defaultStore?.id === store.id;
      if (!isDefaultStore && !(await this.hasMultiStoreAccess(tenantId))) {
        throw new ForbiddenException(
          'Esta loja não está mais disponível — o plano atual só cobre a loja principal. Faça upgrade em /painel/assinatura.',
        );
      }

      return store;
    });
  }

  private async hasMultiStoreAccess(tenantId: string): Promise<boolean> {
    const subscription = await this.billingService.getSubscription(tenantId);
    return subscription?.status === 'active' && MULTI_STORE_PLANS.has(subscription.plan);
  }

  async update(tenantId: string, storeId: string, input: UpdateStoreInput): Promise<StoreRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [current] = await tx
        .select()
        .from(stores)
        .where(and(eq(stores.id, storeId), eq(stores.tenantId, tenantId)))
        .limit(1);
      if (!current) {
        throw new NotFoundException('Loja não encontrada');
      }

      if (input.active === false && current.active) {
        const activeStores = await tx
          .select({ id: stores.id })
          .from(stores)
          .where(and(eq(stores.tenantId, tenantId), eq(stores.active, true)));
        if (activeStores.length <= 1) {
          throw new BadRequestException('Não é possível desativar a única loja ativa do tenant');
        }
      }

      const [updated] = await tx
        .update(stores)
        .set(input)
        .where(and(eq(stores.id, storeId), eq(stores.tenantId, tenantId)))
        .returning();
      if (!updated) {
        throw new Error('Falha ao atualizar loja');
      }
      return updated;
    });
  }
}
