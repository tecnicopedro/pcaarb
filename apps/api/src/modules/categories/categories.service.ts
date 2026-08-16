import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { CreateCategoryInput, UpdateCategoryInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { categories, products, type CategoryRow } from '../../database/schema/index';

@Injectable()
export class CategoriesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list(tenantId: string): Promise<CategoryRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx.select().from(categories).where(eq(categories.tenantId, tenantId)).orderBy(categories.name),
    );
  }

  async findByIdOrThrow(tenantId: string, id: string): Promise<CategoryRow> {
    const category = await runWithTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(categories)
        .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
        .limit(1);
      return row;
    });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }
    return category;
  }

  create(tenantId: string, input: CreateCategoryInput): Promise<CategoryRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [category] = await tx
        .insert(categories)
        .values({ tenantId, name: input.name })
        .returning();
      if (!category) {
        throw new Error('Falha ao criar categoria');
      }
      return category;
    });
  }

  async update(tenantId: string, id: string, input: UpdateCategoryInput): Promise<CategoryRow> {
    await this.findByIdOrThrow(tenantId, id);
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [category] = await tx
        .update(categories)
        .set(input)
        .where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)))
        .returning();
      if (!category) {
        throw new NotFoundException('Categoria não encontrada');
      }
      return category;
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findByIdOrThrow(tenantId, id);
    await runWithTenant(this.db, tenantId, async (tx) => {
      const [productUsingCategory] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.categoryId, id), eq(products.tenantId, tenantId)))
        .limit(1);
      if (productUsingCategory) {
        throw new ConflictException('Existem produtos cadastrados nesta categoria');
      }
      await tx.delete(categories).where(and(eq(categories.id, id), eq(categories.tenantId, tenantId)));
    });
  }
}
