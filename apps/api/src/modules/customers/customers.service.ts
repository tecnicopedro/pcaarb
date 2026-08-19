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

  // Cliente sem nenhum histórico (venda, ponto de fidelidade, lançamento
  // financeiro) é apagado de verdade — nada a perder. Cliente COM histórico
  // é anonimizado em vez de apagado: um DELETE físico cascateava em
  // loyalty_ledger_entries (FK NOT NULL, onDelete cascade), destruindo um
  // ledger que o próprio schema documenta como imutável, e órfão em
  // sales/finance_entries perdia o nome do cliente em relatórios/exportação
  // sem necessidade — anonimizar preserva a integridade dos dois e ainda
  // satisfaz o direito de exclusão da LGPD (art. 18).
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
