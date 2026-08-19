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

  // Não-atômico com a ação principal — chamado como um passo independente
  // logo depois dela já ter sido confirmada (ex.: troca de papel, override
  // de permissão, assinatura/cancelamento). Aceito conscientemente: os call
  // sites que usam este método hoje não tinham nenhuma transação própria
  // antes deste log existir, e reestruturar cada um só pra ganhar atomicidade
  // no registro de auditoria não valia o risco/esforço nesta fatia — log de
  // auditoria como efeito colateral best-effort é o padrão comum de sistemas
  // reais. Onde o call site já está dentro de uma transação com contexto de
  // tenant ativo (devolução de venda, reset de senha), usa `recordTx` abaixo
  // pra comitar ou reverter junto com a ação principal.
  async record(params: RecordAuditLogParams): Promise<void> {
    await runWithTenant(this.db, params.tenantId, (tx) => this.recordTx(tx, params));
  }

  // `audit_logs` tem RLS (FORCE ROW LEVEL SECURITY), então todo insert
  // precisa de `app.tenant_id` setado na transação — seta de novo aqui
  // sempre, mesmo que o chamador já tenha feito isso via `runWithTenant`
  // (idempotente, escopo local à transação): alguns call sites (ex.:
  // `AuthService.resetPassword`) rodam dentro de uma transação simples,
  // sem tenant context nenhum, já que as tabelas que mexem (`users`,
  // `password_reset_tokens`, `refresh_tokens`) ficam fora do RLS por design.
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
