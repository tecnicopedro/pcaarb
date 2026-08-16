import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { CreateSupplierInput, UpdateSupplierInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { suppliers, type SupplierRow } from '../../database/schema/index';

@Injectable()
export class SuppliersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list(tenantId: string): Promise<SupplierRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx.select().from(suppliers).where(eq(suppliers.tenantId, tenantId)).orderBy(suppliers.name),
    );
  }

  async findByIdOrThrow(tenantId: string, id: string): Promise<SupplierRow> {
    const supplier = await runWithTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)))
        .limit(1);
      return row;
    });
    if (!supplier) {
      throw new NotFoundException('Fornecedor não encontrado');
    }
    return supplier;
  }

  create(tenantId: string, input: CreateSupplierInput): Promise<SupplierRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [supplier] = await tx
        .insert(suppliers)
        .values({
          tenantId,
          name: input.name,
          document: input.document ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
        })
        .returning();
      if (!supplier) {
        throw new Error('Falha ao criar fornecedor');
      }
      return supplier;
    });
  }

  async update(tenantId: string, id: string, input: UpdateSupplierInput): Promise<SupplierRow> {
    await this.findByIdOrThrow(tenantId, id);
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [supplier] = await tx
        .update(suppliers)
        .set(input)
        .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)))
        .returning();
      if (!supplier) {
        throw new NotFoundException('Fornecedor não encontrado');
      }
      return supplier;
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findByIdOrThrow(tenantId, id);
    await runWithTenant(this.db, tenantId, (tx) =>
      tx.delete(suppliers).where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId))),
    );
  }
}
