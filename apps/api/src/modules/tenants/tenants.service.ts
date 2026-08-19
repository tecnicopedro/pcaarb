import { ConflictException, Inject, Injectable } from '@nestjs/common';
// Value import: needed for NestJS to inject via emitDecoratorMetadata.
import { ConfigService } from '@nestjs/config';
import { eq, sql } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import type { RegisterTenantInput } from '@pcaarb/shared';
import type { Env } from '../../config/env.validation';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { tenants, users, stores, type TenantRow, type UserRow } from '../../database/schema/index';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class TenantsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async findById(id: string): Promise<TenantRow | undefined> {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    return tenant;
  }

  /** Creates the tenant and its owner user in a single transaction — Phase 0: self-service onboarding. */
  async registerWithOwner(
    input: RegisterTenantInput,
  ): Promise<{ tenant: TenantRow; owner: UserRow }> {
    return this.db.transaction(async (tx) => {
      const [existingTenant] = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.document, input.document))
        .limit(1);
      if (existingTenant) {
        throw new ConflictException('Já existe uma empresa cadastrada com este documento');
      }

      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.ownerEmail))
        .limit(1);
      if (existingUser) {
        throw new ConflictException('Já existe uma conta com este e-mail');
      }

      const trialDays = this.config.get('TRIAL_DAYS', { infer: true });
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

      const [tenant] = await tx
        .insert(tenants)
        .values({
          companyName: input.companyName,
          document: input.document,
          status: 'trial',
          trialEndsAt,
        })
        .returning();
      if (!tenant) {
        throw new Error('Falha ao criar tenant');
      }

      const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
      const [owner] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          name: input.ownerName,
          email: input.ownerEmail,
          passwordHash,
          role: 'owner',
        })
        .returning();
      if (!owner) {
        throw new Error('Falha ao criar usuário owner');
      }

      // Every sale/cash register requires a store — a tenant is born with
      // one (even on the Starter/Profissional plan, which doesn't allow
      // creating a 2nd). See stores.schema.ts and StoresService.create
      // (plan gating).
      // stores has RLS (it's business data, unlike tenants/users) — unlike
      // the rest of this method, which runs outside runWithTenant because
      // the tenant didn't exist yet, this insert needs the context set
      // manually within the same transaction (same mechanism as
      // tenant-context.ts, just without opening a new transaction).
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
      const [store] = await tx.insert(stores).values({ tenantId: tenant.id, name: input.companyName }).returning();
      if (!store) {
        throw new Error('Falha ao criar loja padrão');
      }

      return { tenant, owner };
    });
  }
}
