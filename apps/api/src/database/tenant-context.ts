import { sql } from 'drizzle-orm';
import type { Database } from './drizzle.provider';

/**
 * Runs `fn` inside a transaction with `app.tenant_id` set on the session, so
 * Row-Level Security policies filter data by tenant. A second isolation
 * layer, on top of the application-level TenantStatusGuard.
 *
 * Use in business-data modules from Phase 1 onward (products, sales, stock,
 * finance...), whenever the tenant has already been resolved from the JWT.
 * The identity tables (tenants/users/refresh_tokens) are deliberately left
 * out: login and registration need to locate the user/tenant BEFORE any
 * tenant context exists, so RLS there would block the authentication flow
 * itself. Their isolation is already guaranteed by FK constraints + unique
 * indexes and by the auth services' explicit queries.
 */
export async function runWithTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL doesn't accept bind parameters in Postgres; set_config() is a
    // regular function and safely accepts `${tenantId}` as a parameter.
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx as unknown as Database);
  });
}
