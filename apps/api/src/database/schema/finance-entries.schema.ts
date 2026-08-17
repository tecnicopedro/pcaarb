import { pgTable, uuid, text, integer, date, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.schema';
import { users } from './users.schema';
import { customers } from './customers.schema';
import { suppliers } from './suppliers.schema';
import { costCenters } from './cost-centers.schema';

export const financeEntryTypeEnum = pgEnum('finance_entry_type', ['payable', 'receivable']);
export const financeEntryStatusEnum = pgEnum('finance_entry_status', ['pending', 'paid', 'canceled']);

export const financeEntries = pgTable('finance_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  type: financeEntryTypeEnum('type').notNull(),
  description: text('description').notNull(),
  amountCents: integer('amount_cents').notNull(),
  dueDate: date('due_date', { mode: 'string' }).notNull(),
  status: financeEntryStatusEnum('status').notNull().default('pending'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  // Só um dos dois é preenchido, dependendo do type (receivable -> customer,
  // payable -> supplier); ambos opcionais porque nem toda conta tem uma
  // contraparte cadastrada (ex.: conta de luz).
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  costCenterId: uuid('cost_center_id').references(() => costCenters.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type FinanceEntryRow = typeof financeEntries.$inferSelect;
export type NewFinanceEntryRow = typeof financeEntries.$inferInsert;
