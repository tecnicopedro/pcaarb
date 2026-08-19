import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';

// Every sale/cash session happens at a store — even a tenant on the Starter/
// Profissional plan (a single store) has one row here, created automatically
// at registration (see TenantsService.registerWithOwner). Creating a 2nd
// store is restricted to the Multi-store plan (see BillingService/StoresService)
// — it's literally what that plan sells.
export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type StoreRow = typeof stores.$inferSelect;
export type NewStoreRow = typeof stores.$inferInsert;
