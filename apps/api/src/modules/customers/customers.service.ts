import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { CreateCustomerInput, UpdateCustomerInput } from '@pcaarb/shared';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { customers, type CustomerRow } from '../../database/schema/index';
import { DataPrivacyService } from '../data-privacy/data-privacy.service';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly dataPrivacyService: DataPrivacyService,
  ) {}

  list(tenantId: string): Promise<CustomerRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx.select().from(customers).where(eq(customers.tenantId, tenantId)).orderBy(customers.name),
    );
  }

  async findByIdOrThrow(tenantId: string, id: string): Promise<CustomerRow> {
    const customer = await runWithTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
        .limit(1);
      return row;
    });
    if (!customer) {
      throw new NotFoundException('Cliente não encontrado');
    }
    return customer;
  }

  create(tenantId: string, input: CreateCustomerInput): Promise<CustomerRow> {
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [customer] = await tx
        .insert(customers)
        .values({
          tenantId,
          name: input.name,
          document: input.document ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
        })
        .returning();
      if (!customer) {
        throw new Error('Falha ao criar cliente');
      }
      return customer;
    });
  }

  async update(tenantId: string, id: string, input: UpdateCustomerInput): Promise<CustomerRow> {
    await this.findByIdOrThrow(tenantId, id);
    return runWithTenant(this.db, tenantId, async (tx) => {
      const [customer] = await tx
        .update(customers)
        .set(input)
        .where(and(eq(customers.id, id), eq(customers.tenantId, tenantId)))
        .returning();
      if (!customer) {
        throw new NotFoundException('Cliente não encontrado');
      }
      return customer;
    });
  }

  // A customer with no history at all (sale, loyalty point, financial entry)
  // is hard-deleted — nothing to lose. A customer WITH history is
  // anonymized instead of deleted: a physical DELETE would cascade into
  // loyalty_ledger_entries (NOT NULL FK, onDelete cascade), destroying a
  // ledger the schema itself documents as immutable, and orphaning
  // sales/finance_entries would needlessly lose the customer's name in
  // reports/exports — anonymizing preserves the integrity of both and still
  // satisfies the LGPD right to erasure (art. 18).
  async remove(tenantId: string, id: string, actorUserId: string): Promise<void> {
    await this.findByIdOrThrow(tenantId, id);
    const hasHistory = await this.dataPrivacyService.hasHistory(tenantId, id);
    if (hasHistory) {
      await this.dataPrivacyService.anonymizeCustomerData(tenantId, id, actorUserId);
      return;
    }
    await runWithTenant(this.db, tenantId, (tx) =>
      tx.delete(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenantId))),
    );
  }
}
