import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { CreateStoreInput, UpdateStoreInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { stores, type StoreRow } from '../../database/schema/index';
import { BillingService } from '../billing/billing.service';

// Planos que podem operar mais de uma loja — é literalmente o que o plano
// Multi-loja vende (ver SUBSCRIPTION_PLAN_CATALOG). Toda conta nasce com uma
// loja (TenantsService.registerWithOwner); criar a 2ª é o gate real.
const MULTI_STORE_PLANS = new Set(['multi_loja', 'enterprise']);

@Injectable()
export class StoresService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly billingService: BillingService,
  ) {}

  // Ordenado por criação: a loja padrão criada no registro do tenant sempre
  // vem primeiro — usado por testes e pela UI pra assumir "a primeira é a
  // original" sem precisar de outro sinal.
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

  // Reavalia o plano a cada USO, não só na criação — achado em revisão de
  // segurança (2026-08-17): sem isso, assinar Multi-loja, criar lojas extras
  // e depois voltar pro Starter deixava as lojas extras utilizáveis pra
  // sempre (a checagem de create() só rodava uma vez). A loja mais antiga do
  // tenant (a padrão, criada no registro) nunca é bloqueada — todo tenant
  // precisa conseguir operar pelo menos uma loja, em qualquer plano.
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
