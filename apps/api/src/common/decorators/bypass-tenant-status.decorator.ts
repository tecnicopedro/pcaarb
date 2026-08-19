import { SetMetadata } from '@nestjs/common';

export const BYPASS_TENANT_STATUS_KEY = 'bypassTenantStatus';

/**
 * Marks a route as reachable even with a `blocked`/`canceled` tenant — without
 * this, a tenant blocked for non-payment couldn't even view its invoice or
 * reactivate the subscription, because TenantStatusGuard blocks everything
 * before it reaches the controller. Use restricted to billing endpoints
 * (viewing subscription/invoices, reactivating).
 */
export const BypassTenantStatus = () => SetMetadata(BYPASS_TENANT_STATUS_KEY, true);
