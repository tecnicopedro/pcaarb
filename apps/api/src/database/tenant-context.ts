import { sql } from 'drizzle-orm';
import type { Database } from './drizzle.provider';

/**
 * Executa `fn` dentro de uma transação com `app.tenant_id` setado na sessão,
 * para que policies de Row-Level Security filtrem os dados por tenant.
 * Segunda camada de isolamento, além do TenantStatusGuard na aplicação.
 *
 * Usar nos módulos de dado de negócio a partir da Fase 1 (produtos, vendas,
 * estoque, financeiro...), sempre que o tenant já estiver resolvido do JWT.
 * As tabelas de identidade (tenants/users/refresh_tokens) ficam de fora de
 * propósito: login e registro precisam localizar o usuário/tenant ANTES de
 * qualquer contexto de tenant existir, então RLS ali bloquearia o próprio
 * fluxo de autenticação. O isolamento delas já é garantido por FK + índices
 * únicos e pelas queries explícitas dos services de auth.
 */
export async function runWithTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL não aceita bind parameters no Postgres; set_config() é uma
    // função normal e aceita `${tenantId}` como parâmetro com segurança.
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx as unknown as Database);
  });
}
