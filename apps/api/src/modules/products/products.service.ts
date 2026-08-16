import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { CreateProductInput, UpdateProductInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { categories, products, type ProductRow } from '../../database/schema/index';

@Injectable()
export class ProductsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list(tenantId: string): Promise<ProductRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx.select().from(products).where(eq(products.tenantId, tenantId)).orderBy(products.name),
    );
  }

  async findByIdOrThrow(tenantId: string, id: string): Promise<ProductRow> {
    const product = await runWithTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
        .limit(1);
      return row;
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }
    return product;
  }

  create(tenantId: string, input: CreateProductInput): Promise<ProductRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      await this.assertSkuAvailable(tx, tenantId, input.sku);
      await this.assertCategoryExists(tx, tenantId, input.categoryId);

      const [product] = await tx
        .insert(products)
        .values({
          tenantId,
          categoryId: input.categoryId ?? null,
          sku: input.sku ?? null,
          name: input.name,
          description: input.description ?? null,
          unit: input.unit,
          priceCents: input.priceCents,
          costPriceCents: input.costPriceCents ?? null,
        })
        .returning();
      if (!product) {
        throw new Error('Falha ao criar produto');
      }
      return product;
    });
  }

  async update(tenantId: string, id: string, input: UpdateProductInput): Promise<ProductRow> {
    await this.findByIdOrThrow(tenantId, id);
    return runWithTenant(this.db, tenantId, async (tx) => {
      if (input.sku !== undefined) {
        await this.assertSkuAvailable(tx, tenantId, input.sku, id);
      }
      if (input.categoryId !== undefined) {
        await this.assertCategoryExists(tx, tenantId, input.categoryId);
      }

      const [product] = await tx
        .update(products)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(products.id, id), eq(products.tenantId, tenantId)))
        .returning();
      if (!product) {
        throw new NotFoundException('Produto não encontrado');
      }
      return product;
    });
  }

  // Sem endpoint de exclusão definitiva de propósito: itens de venda (Fase 1
  // PDV) vão referenciar produtos, e apagar quebraria o histórico. "Excluir"
  // aqui é sempre `update({ active: false })`.

  private async assertSkuAvailable(
    tx: Database,
    tenantId: string,
    sku: string | null | undefined,
    excludeId?: string,
  ): Promise<void> {
    if (!sku) {
      return;
    }
    const [existing] = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.sku, sku)))
      .limit(1);
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('Já existe um produto com este SKU');
    }
  }

  private async assertCategoryExists(
    tx: Database,
    tenantId: string,
    categoryId: string | null | undefined,
  ): Promise<void> {
    if (!categoryId) {
      return;
    }
    const [category] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.tenantId, tenantId)))
      .limit(1);
    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }
  }
}
