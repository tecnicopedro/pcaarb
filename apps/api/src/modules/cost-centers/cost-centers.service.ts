import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { CreateCostCenterInput, UpdateCostCenterInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { costCenters, type CostCenterRow } from '../../database/schema/index';

@Injectable()
export class CostCentersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list(tenantId: string): Promise<CostCenterRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx.select().from(costCenters).where(eq(costCenters.tenantId, tenantId)).orderBy(costCenters.name),
    );
  }

  async create(tenantId: string, input: CreateCostCenterInput): Promise<CostCenterRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [costCenter] = await tx.insert(costCenters).values({ tenantId, name: input.name }).returning();
      if (!costCenter) {
        throw new Error('Falha ao criar centro de custo');
      }
      return costCenter;
    });
  }

  async update(tenantId: string, id: string, input: UpdateCostCenterInput): Promise<CostCenterRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [costCenter] = await tx
        .update(costCenters)
        .set(input)
        .where(and(eq(costCenters.id, id), eq(costCenters.tenantId, tenantId)))
        .returning();
      if (!costCenter) {
        throw new NotFoundException('Centro de custo não encontrado');
      }
      return costCenter;
    });
  }
}
