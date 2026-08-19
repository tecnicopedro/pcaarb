import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/drizzle.provider';
import { runWithTenant } from '../../database/tenant-context';
import { auditLogs, type AuditLogRow } from '../../database/schema/index';

export interface RecordAuditLogParams {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Not atomic with the main action — called as an independent step right
  // after that action has already been committed (e.g. role change,
  // permission override, subscribe/cancel). Accepted knowingly: the call
  // sites using this method today had no transaction of their own before
  // this log existed, and restructuring each one just to gain atomicity on
  // the audit record wasn't worth the risk/effort for this slice — best-effort
  // audit logging as a side effect is the common pattern in real systems.
  // Where the call site is already inside a transaction with an active
  // tenant context (sale return, password reset), use `recordTx` below to
  // commit or roll back together with the main action.
  async record(params: RecordAuditLogParams): Promise<void> {
    await runWithTenant(this.db, params.tenantId, (tx) => this.recordTx(tx, params));
  }

  // `audit_logs` has RLS (FORCE ROW LEVEL SECURITY), so every insert needs
  // `app.tenant_id` set on the transaction — always set it again here, even
  // if the caller already did so via `runWithTenant` (idempotent, scoped to
  // the transaction): some call sites (e.g. `AuthService.resetPassword`) run
  // inside a plain transaction with no tenant context at all, since the
  // tables they touch (`users`, `password_reset_tokens`, `refresh_tokens`)
  // are outside RLS by design.
  async recordTx(tx: Database, params: RecordAuditLogParams): Promise<void> {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${params.tenantId}, true)`);
    await tx.insert(auditLogs).values({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata ?? null,
    });
  }

  async list(tenantId: string): Promise<AuditLogRow[]> {
    return runWithTenant(this.db, tenantId, (tx) =>
      tx.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantId)).orderBy(desc(auditLogs.createdAt)),
    );
  }
}
